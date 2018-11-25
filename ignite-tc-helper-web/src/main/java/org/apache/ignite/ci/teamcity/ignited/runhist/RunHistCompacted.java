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

package org.apache.ignite.ci.teamcity.ignited.runhist;

import com.google.common.base.MoreObjects;
import com.google.common.collect.Lists;
import org.apache.ignite.cache.query.annotations.QuerySqlField;
import org.apache.ignite.ci.analysis.IVersionedEntity;
import org.apache.ignite.ci.teamcity.ignited.IRunHistory;
import org.apache.ignite.ci.teamcity.ignited.IStringCompactor;
import org.apache.ignite.ci.teamcity.ignited.fatbuild.TestCompacted;

import javax.annotation.Nullable;
import java.util.Date;
import java.util.List;

public class RunHistCompacted implements IVersionedEntity, IRunHistory {
    /** Latest version. */
    private static final int LATEST_VERSION = 1;

    /** Entity fields version. */
    @SuppressWarnings("FieldCanBeLocal")
    private short _ver = LATEST_VERSION;

    @QuerySqlField(orderedGroups = {@QuerySqlField.Group(name = "tstAndSrv", order = 0)})
    private int testNameOrSuite;

    @QuerySqlField(orderedGroups = {@QuerySqlField.Group(name = "tstAndSrv", order = 1)})
    private int srvId;

    private InvocationData data = new InvocationData();

    public RunHistCompacted() {}

    public RunHistCompacted(RunHistKey k) {
        testNameOrSuite = k.testNameOrSuite();
        srvId = k.srvId();
    }

    /** {@inheritDoc} */
    @Override public int version() {
        return _ver;
    }

    /** {@inheritDoc} */
    @Override public int latestVersion() {
        return LATEST_VERSION;
    }

    /** {@inheritDoc} */
    @Override public int getRunsCount() {
        return data.notMutedRunsCount();
    }

    /** {@inheritDoc} */
    @Override public int getFailuresCount() {
        return data.failuresCount();
    }

    /** {@inheritDoc} */
    @Override public int getFailuresAllHist() {
        return data.allHistFailures();
    }

    /** {@inheritDoc} */
    @Override public int getRunsAllHist() {
        return data.allHistRuns();
    }

    /** {@inheritDoc} */
    @Nullable
    @Override public List<Integer> getLatestRunResults() {
        return data.getLatestRuns();
    }

    @Override public String getFlakyComments() {
        return null;
    }

    /**
     * @param c Compactor.
     * @param testCompacted Test compacted.
     * @param build Build.
     * @param startDate Start date.
     */
    public void addTestRun(IStringCompactor c, TestCompacted testCompacted, int build, long startDate) {
        data.add(c, testCompacted, build, startDate);
    }

    /** {@inheritDoc} */
    @Override public String toString() {
        return MoreObjects.toStringHelper(this)
                .add("nameId", testNameOrSuite)
                .add("srvId", srvId)
                .add("failRate", getFailPercentPrintable())
                .add("data", data)
                .toString();
    }
}