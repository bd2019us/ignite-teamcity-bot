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

package org.apache.ignite.ci.teamcity.ignited;

import javax.annotation.Nullable;
import org.apache.ignite.ci.teamcity.ignited.fatbuild.FatBuildCompacted;
import org.apache.ignite.ci.user.ICredentialsProv;

import javax.inject.Inject;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class TeamcityIgnitedProviderMock implements ITeamcityIgnitedProvider {
    /** Compactor. */
    @Inject IStringCompactor compactor;

    private Map<String, Map<Integer, FatBuildCompacted>> tcBuildsData = new ConcurrentHashMap<>();

    public void addServer(String srvId, Map<Integer, FatBuildCompacted> apacheBuilds) {
        tcBuildsData.put(srvId, apacheBuilds);
    }

    /** {@inheritDoc} */
    @Override public boolean hasAccess(String srvId, @Nullable ICredentialsProv prov) {
        return prov.hasAccess(srvId);
    }

    /** {@inheritDoc} */
    @Override public ITeamcityIgnited server(String srvId, ICredentialsProv prov) {
        final Map<Integer, FatBuildCompacted> integerFatBuildCompactedMap = tcBuildsData.get(srvId);

        return TeamcityIgnitedMock.getMutableMapTeamcityIgnited(integerFatBuildCompactedMap, compactor);
    }
}
