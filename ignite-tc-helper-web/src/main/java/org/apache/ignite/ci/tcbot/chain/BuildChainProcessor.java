/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.ignite.ci.tcbot.chain;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.stream.Stream;
import javax.annotation.Nonnull;
import javax.inject.Inject;
import org.apache.ignite.ci.IAnalyticsEnabledTeamcity;
import org.apache.ignite.ci.ITeamcity;
import org.apache.ignite.ci.analysis.FullChainRunCtx;
import org.apache.ignite.ci.analysis.MultBuildRunCtx;
import org.apache.ignite.ci.analysis.RunStat;
import org.apache.ignite.ci.analysis.SingleBuildRunCtx;
import org.apache.ignite.ci.analysis.SuiteInBranch;
import org.apache.ignite.ci.analysis.mode.LatestRebuildMode;
import org.apache.ignite.ci.analysis.mode.ProcessLogsMode;
import org.apache.ignite.ci.di.AutoProfiling;
import org.apache.ignite.ci.tcmodel.hist.BuildRef;
import org.apache.ignite.ci.tcmodel.result.Build;
import org.apache.ignite.ci.teamcity.ignited.BuildRefCompacted;
import org.apache.ignite.ci.teamcity.ignited.BuildRefDao;
import org.apache.ignite.ci.teamcity.ignited.IStringCompactor;
import org.apache.ignite.ci.teamcity.ignited.ITeamcityIgnited;
import org.apache.ignite.ci.teamcity.ignited.change.ChangeCompacted;
import org.apache.ignite.ci.teamcity.ignited.fatbuild.FatBuildCompacted;
import org.apache.ignite.ci.util.FutureUtil;
import org.apache.ignite.ci.web.TcUpdatePool;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Process whole Build Chain, E.g. runAll at particular server, including all builds involved
 */
public class BuildChainProcessor {
    /** Logger. */
    private static final Logger logger = LoggerFactory.getLogger(BuildChainProcessor.class);

    /** TC REST updates pool. */
    @Inject private TcUpdatePool tcUpdatePool;

    /** Compactor. */
    @Inject private IStringCompactor compactor;

    /**
     * @param teamcity Teamcity.
     * @param teamcityIgnited
     * @param entryPoints Entry points.
     * @param includeLatestRebuild Include latest rebuild.
     * @param procLog Process logger.
     * @param includeScheduledInfo Include scheduled info.
     * @param failRateBranch Fail rate branch.
     */
    @AutoProfiling
    public FullChainRunCtx loadFullChainContext(
        IAnalyticsEnabledTeamcity teamcity,
        ITeamcityIgnited teamcityIgnited,
        Collection<BuildRef> entryPoints,
        LatestRebuildMode includeLatestRebuild,
        ProcessLogsMode procLog,
        boolean includeScheduledInfo,
        @Nullable String failRateBranch) {

        if (entryPoints.isEmpty())
            return new FullChainRunCtx(Build.createFakeStub());

        Map<Integer, FatBuildCompacted> builds = new ConcurrentHashMap<>();
        Map<String, MultBuildRunCtx> buildsCtxMap = new ConcurrentHashMap<>();

        final Stream<FatBuildCompacted> entryPointsFatBuilds = entryPoints.stream().map(BuildRef::getId)
                .filter(Objects::nonNull)
                .filter(id -> !builds.containsKey(id)) //load and propagate only new entry points
                .map(id -> builds.computeIfAbsent(id, teamcityIgnited::getFatBuild));

        Stream<FatBuildCompacted> uniqueBuildsInvolved = entryPointsFatBuilds
                .flatMap(ref -> dependencies(teamcityIgnited, builds, ref))
                .flatMap(ref -> dependencies(teamcityIgnited, builds, ref));

        final ExecutorService svc = tcUpdatePool.getService();

        final List<Future<Stream<FatBuildCompacted>>> phase1Submitted = uniqueBuildsInvolved
                .map((buildRef) -> svc.submit(
                        () -> replaceWithRecent(teamcityIgnited, includeLatestRebuild, builds, buildRef, entryPoints.size())))
                .collect(Collectors.toList());


        final List<Future<? extends Stream<FatBuildCompacted>>> phase2Submitted = phase1Submitted.stream()
                .map(FutureUtil::getResult)
                .map((s) -> svc.submit(
                        () -> processBuildList(teamcityIgnited, buildsCtxMap, s)))
                .collect(Collectors.toList());

        phase2Submitted.forEach(FutureUtil::getResult);

        ArrayList<MultBuildRunCtx> contexts = new ArrayList<>(buildsCtxMap.values());

        contexts.forEach(multiCtx -> {
            analyzeTests(multiCtx, teamcity, procLog);

            fillBuildCounts(multiCtx, teamcityIgnited, includeScheduledInfo);
        });

        Function<MultBuildRunCtx, Float> function = ctx -> {
            SuiteInBranch key = new SuiteInBranch(ctx.suiteId(), normalizeBranch(failRateBranch));

            RunStat runStat = teamcity.getBuildFailureRunStatProvider().apply(key);

            if (runStat == null)
                return 0f;

            //some hack to bring timed out suites to top
            return runStat.getCriticalFailRate() * 3.14f + runStat.getFailRate();
        };


        BuildRef someEntryPoint = entryPoints.iterator().next();
        FatBuildCompacted build = builds.computeIfAbsent(someEntryPoint.getId(), teamcityIgnited::getFatBuild);
        FullChainRunCtx fullChainRunCtx = new FullChainRunCtx(build.toBuild(compactor));

        contexts.sort(Comparator.comparing(function).reversed());

        fullChainRunCtx.addAllSuites(contexts);

        return fullChainRunCtx;
    }

    @SuppressWarnings("WeakerAccess")
    @NotNull
    @AutoProfiling
    protected Stream<FatBuildCompacted> processBuildList(ITeamcityIgnited teamcityIgnited, Map<String, MultBuildRunCtx> buildsCtxMap,
                                                         Stream<FatBuildCompacted> list) {
        list.forEach((FatBuildCompacted buildCompacted) -> {
            final BuildRef ref = buildCompacted.toBuildRef(compactor);

            MultBuildRunCtx ctx = buildsCtxMap.computeIfAbsent(ref.buildTypeId,
                    k -> new MultBuildRunCtx(ref, compactor));

            ctx.addBuild(loadTestsAndProblems(buildCompacted, ctx, teamcityIgnited));
        });

        return list;
    }

    /**
     * Runs deep collection of all related statistics for particular build.
     *
     * @param buildCompacted Build ref from history with references to tests.
     * @param tcIgnited
     * @return Full context.
     */
    public SingleBuildRunCtx loadTestsAndProblems(@Nonnull FatBuildCompacted buildCompacted,
                                                  @Deprecated MultBuildRunCtx mCtx, ITeamcityIgnited tcIgnited) {
        SingleBuildRunCtx ctx = new SingleBuildRunCtx(buildCompacted, compactor);

        _testList(buildCompacted, mCtx);

        final int[] changeIds = buildCompacted.changes();

        Collection<ChangeCompacted> changes = tcIgnited.getAllChanges(changeIds);
        ctx.setChanges(changes);

        //todo support storing build.lastChanges.changes) ?

        return ctx;
    }

    @AutoProfiling
    public void _testList(@Nonnull FatBuildCompacted buildCompacted, @Deprecated MultBuildRunCtx mCtx) {
        if (!buildCompacted.isComposite())
            mCtx.addTests(buildCompacted.getTestOcurrences(compactor).getTests());
    }

    @SuppressWarnings("WeakerAccess")
    @NotNull
    @AutoProfiling
    protected Stream< FatBuildCompacted> replaceWithRecent(ITeamcityIgnited teamcityIgnited,
                                                           LatestRebuildMode includeLatestRebuild,
                                                           Map<Integer, FatBuildCompacted> builds,
                                                           FatBuildCompacted buildCompacted,
                                                           int cntLimit) {
        if (includeLatestRebuild == LatestRebuildMode.NONE)
            return Stream.of(buildCompacted);

        final String branch = getBranchOrDefault(buildCompacted.branchName(compactor));

        //todo now it is a full scan without caching, probably it is better to make branch based index query & caching results
        Stream<BuildRefCompacted> history = teamcityIgnited.getBuildHistoryCompacted(buildCompacted.buildTypeId(compactor), branch)
            .stream()
            .filter(t -> t.isNotCancelled(compactor))
            .filter(t -> t.isFinished(compactor));

        if (includeLatestRebuild == LatestRebuildMode.LATEST) {
            BuildRefCompacted recentRef = history.max(Comparator.comparing(BuildRefCompacted::id))
                    .orElse(buildCompacted);

            return Stream.of(recentRef)
                    .map(b -> builds.computeIfAbsent(b.id(), teamcityIgnited::getFatBuild));
        }

        if (includeLatestRebuild == LatestRebuildMode.ALL) {
            return history
                    .sorted(Comparator.comparing(BuildRefCompacted::id).reversed())
                    .limit(cntLimit)
                    .map(b -> builds.computeIfAbsent(b.id(), teamcityIgnited::getFatBuild));
        }

        throw new UnsupportedOperationException("invalid mode " + includeLatestRebuild);
    }

    @NotNull private static String getBranchOrDefault(@Nullable String branchName) {
        return branchName == null ? ITeamcity.DEFAULT : branchName;
    }

    @SuppressWarnings("WeakerAccess")
    @AutoProfiling
    protected void fillBuildCounts(MultBuildRunCtx outCtx,
        ITeamcityIgnited teamcityIgnited, boolean includeScheduledInfo) {
        if (includeScheduledInfo && !outCtx.hasScheduledBuildsInfo()) {
            long cntRunning = teamcityIgnited.getBuildHistoryCompacted(outCtx.buildTypeId(), outCtx.branchName())
                .stream()
                    .filter(r -> r.isNotCancelled(compactor))
                    .filter(r -> r.isRunning(compactor)).count();

            outCtx.setRunningBuildCount((int) cntRunning);

            //todo queue compacted instead of full
            long cntQueued = teamcityIgnited.getBuildHistory(outCtx.buildTypeId(), outCtx.branchName())
                .stream().filter(BuildRef::isNotCancelled).filter(BuildRef::isQueued).count();

            outCtx.setQueuedBuildCount((int) cntQueued);
        }
    }

    @SuppressWarnings("WeakerAccess")
    @AutoProfiling
    protected static void analyzeTests(MultBuildRunCtx outCtx, IAnalyticsEnabledTeamcity teamcity,
                                     ProcessLogsMode procLog) {
        for (SingleBuildRunCtx ctx : outCtx.getBuilds()) {
            teamcity.calculateBuildStatistic(ctx);

            if ((procLog == ProcessLogsMode.SUITE_NOT_COMPLETE && ctx.hasSuiteIncompleteFailure())
                    || procLog == ProcessLogsMode.ALL)
                ctx.setLogCheckResFut(teamcity.analyzeBuildLog(ctx.buildId(), ctx));
        }
    }

    @NotNull public static String normalizeBranch(@NotNull final BuildRef build) {
        return normalizeBranch(build.branchName);
    }

    @NotNull public static String normalizeBranch(@Nullable String branchName) {
        String branch = getBranchOrDefault(branchName);

        if ("refs/heads/master".equals(branch))
            return ITeamcity.DEFAULT;

        return branch;
    }

    @NotNull
    private Stream<FatBuildCompacted> dependencies(
            ITeamcityIgnited teamcityIgnited,
            Map<Integer, FatBuildCompacted> builds,
            FatBuildCompacted build) {
        return Stream.concat(Stream.of(build),
                IntStream.of(build.snapshotDependencies())
                        .filter(id -> !builds.containsKey(id)) //load and propagate only new dependencies
                        .mapToObj(id -> builds.computeIfAbsent(id, teamcityIgnited::getFatBuild)));
    }
}
