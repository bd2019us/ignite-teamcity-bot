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
//loadData(); // should be defined by page
//loadStatus element should be provided on page
//triggerConfirm & triggerDialog element should be provided on page (may be hidden)
var g_initMoreInfoDone = false;

/** Object used to notify git. See ChainAtServerCurrentStatus Java class. */
var g_srv_to_notify_git;

//@param results - TestFailuresSummary
function showChainOnServersResults(result) {
    var minFailRateP = findGetParameter("minFailRate");
    var minFailRate = minFailRateP == null ? 0 : parseFloat(minFailRateP);

    var maxFailRateP = findGetParameter("maxFailRate");
    var maxFailRate = maxFailRateP == null ? 100 : parseFloat(maxFailRateP);

    var hideFlakyFailuresP = findGetParameter("hideFlakyFailures");
    var hideFlakyFailures = hideFlakyFailuresP == null ? false : "true"===hideFlakyFailuresP;

    return showChainResultsWithSettings(result, new Settings(minFailRate, maxFailRate, result.javaFlags, hideFlakyFailures));
}

class Settings {
    constructor(minFailRate, maxFailRate, javaFlags, hideFlakyFailures) {
        this.minFailRate = minFailRate;
        this.maxFailRate = maxFailRate;
        this.javaFlags = javaFlags;
        this.hideFlakyFailures = hideFlakyFailures;
    }

    isTeamCityAvailable() {
        return this.javaFlags & 1;
    };

    isGithubAvailable() {
        return this.javaFlags & 2
    };

    isJiraAvailable() {
        return this.javaFlags & 4
    };
}

//@param results - TestFailuresSummary
//@param settings - Settings (JS class)
function showChainResultsWithSettings(result, settings) {
    var res = "";
    res += "<table border='0px'><tr><td colspan='4'>Chain results";

    if(isDefinedAndFilled(result.trackedBranch)) {
        res+=" for [" + result.trackedBranch + "]";
    }

    if (isDefinedAndFilled(result.failedTests) &&
        isDefinedAndFilled(result.failedToFinish)) {
        res += " [";
        res += "tests " + result.failedTests + " suites " + result.failedToFinish + "";
        res += "]";
    } else
        res += " is absent";

    res += "</td></tr>";
    res += "</table></br>";

    for (var i = 0; i < result.servers.length; i++) {
        var server = result.servers[i];
        res += showChainCurrentStatusData(server, settings);
    }

    setTimeout(initMoreInfo, 100);

    return res;
}


/**
 * @param server - see org.apache.ignite.ci.web.model.current.ChainAtServerCurrentStatus Java Class.
 * @param settings - see Settings JavaScript class.
 */
function showChainCurrentStatusData(server, settings) {
    if(!isDefinedAndFilled(server))
        return;

    if(isDefinedAndFilled(server.buildNotFound) && server.buildNotFound ) {
        return "<tr><td><b>Error: Build not found for branch [" + server.branchName + "]</b>" +
            "<br><br><span style='color:grey; font-size:12px;'>Perhaps, more than 2 weeks have passed since the last build " +
            "run. <br>There is no data on the TC server</span></td></tr>";
    }

    var res = "";

    res += "<table style='width: 100%;' border='0px'>";
    res += "<tr bgcolor='#F5F5FF'><td colspan='3' width='75%'>";
    res += "<table style='width: 40%'>";
    res += "<tr><td><b> Server: </b></td><td>[" + server.serverId + "]</td></tr>";

    if (isDefinedAndFilled(server.prNum)) {
        res += "<tr><td><b> PR: </b></td><td>";

        if (isDefinedAndFilled(server.webToPr))
            res += "<a href='" + server.webToPr + "'>[#" + server.prNum + "]</a>";
        else
            res += "[#" + server.prNum + "]";

        res += "</td></tr>";
    }

    if (isDefinedAndFilled(server.webToTicket) && isDefinedAndFilled(server.ticketFullName)) {
        res += "<tr><td><b> Ticket: </b></td><td>";
        res += "<a href='" + server.webToTicket + "'>[" + server.ticketFullName + "]</a>";
        res += "</td></tr>";
    }

    let parentSuitId;

    if (isDefinedAndFilled(findGetParameter("suiteId")))
        parentSuitId = findGetParameter("suiteId");
    else if (isDefinedAndFilled(server))
        parentSuitId = findGetParameter("buildTypeId", server.webToHist);

    if (isDefinedAndFilled(parentSuitId)) {
        res += "<tr><td><b> Suite: </b></td><td>[" + parentSuitId + "] ";
        res += " <a href='" + server.webToHist + "'>[TC history]</a>";
        res += "</td></tr>";
    }

    res += "</table>";
    res += "</br>";

    if (isDefinedAndFilled(server.chainName)) {
        res += server.chainName + " ";
    }

    res += "<b>Chain result: </b>";

    if (isDefinedAndFilled(server.failedToFinish) && isDefinedAndFilled(server.failedTests))
        res += server.failedToFinish + " suites and " + server.failedTests + " tests failed";
    else
        res += "empty";

    res += " ";
    res += "<a href='longRunningTestsReport.html'>";
    res += "Long running tests report";
    res += "</a>";

    var mInfo = "";

    var cntFailed = 0;
    var suitesFailedList = "";
    for (var i = 0; i < server.suites.length; i++) {
        var suite = server.suites[i];

        if (!isDefinedAndFilled(suite.suiteId))
            continue;

        //may check failure here in case mode show all

        if (suitesFailedList.length !== 0)
            suitesFailedList += ",";

        suitesFailedList += suite.suiteId;
        cntFailed++;
    }

    if (suitesFailedList.length !== 0 && isDefinedAndFilled(server.serverId) && isDefinedAndFilled(server.branchName)) {
        mInfo += "Trigger failed " + cntFailed + " builds";
        mInfo += " <a href='javascript:void(0);' ";
        mInfo += " onClick='triggerBuilds(\"" + server.serverId + "\", \"" + parentSuitId + "\", " +
            "\"" + suitesFailedList + "\", \"" + server.branchName + "\", false, false, null, \"" + server.prNum + "\")' ";
        mInfo += " title='trigger builds'>in queue</a> ";

        mInfo += " <a href='javascript:void(0);' ";
        mInfo += " onClick='triggerBuilds(\"" + server.serverId + "\", \"" + parentSuitId + "\", " +
            "\"" + suitesFailedList + "\", \"" + server.branchName + "\", true, false, null, \"" + server.prNum + "\")' ";
        mInfo += " title='trigger builds'>on top</a><br>";
    }

    mInfo += "Duration: " + server.durationPrintable +
        " (Tests: " + server.testsDurationPrintable + "," +
        " Timeouts: " + server.lostInTimeouts + ")<br>";

    if (isDefinedAndFilled(server.topLongRunning) && server.topLongRunning.length > 0) {
        mInfo += "Top long running:<br>";

        mInfo += "<table>";
        for (var j = 0; j < server.topLongRunning.length; j++) {
            mInfo += showTestFailData(server.topLongRunning[j], false, settings);
        }
        mInfo += "</table>";
    }


    if (isDefinedAndFilled(server.logConsumers) && server.logConsumers.length > 0) {
        mInfo += "Top Log Consumers:<br>";

        mInfo += "<table>";
        for (var k = 0; k < server.logConsumers.length; k++) {
            mInfo += showTestFailData(server.logConsumers[k], false, settings);
        }
        mInfo += "</table>";
    }

    if(!isDefinedAndFilled(findGetParameter("reportMode"))) {
        res += "<span class='container'>";
        res += " <a href='javascript:void(0);' class='header'>" + more + "</a>";
        res += "<div class='content'>" + mInfo + "</div></span>";
    }

    res += "</td><td>";

    // if (settings.isGithubAvailable()) {
    //     g_srv_to_notify_git = server;
    //     res += "<button onclick='notifyGit()'>Update PR status</button>";
    // }

    if (settings.isJiraAvailable()) {
        res += "<button onclick='commentJira(\"" + server.serverId + "\", \"" + server.branchName + "\", \""
            + parentSuitId + "\")'>Comment JIRA</button>&nbsp;&nbsp;";

        var blockersList = "";

        for (var l = 0; l < server.suites.length; l++) {
            var suite0 = server.suites[l];

            var suiteOrNull = suiteWithCriticalFailuresOnly(suite0);

            if (suiteOrNull != null) {
                if (blockersList.length !== 0)
                    blockersList += ",";

                blockersList += suite0.suiteId;
            }
        }

        res += "<button onclick='triggerBuilds(\"" + server.serverId + "\", \"" + parentSuitId + "\", \"" +
            blockersList + "\", \"" + server.branchName + "\", false, false, null,  \"" + + server.prNum + "\")'> " +
            "Re-run possible blockers</button><br>";

        res += "<button onclick='triggerBuilds(\"" + server.serverId + "\", \"" + parentSuitId + "\", \"" +
            blockersList + "\", \"" + server.branchName + "\", false, true, null, \"" + + server.prNum +"\")'> " +
            "Re-run possible blockers & Comment JIRA</button><br>";
    }

    if (isDefinedAndFilled(server.baseBranchForTc)) {
        // if (settings.isGithubAvailable())
        //     res+="<br>";

        if (settings.isJiraAvailable())
            res+="<br>";

        res += "Base branch";
        res += ": " + server.baseBranchForTc.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    res += "&nbsp;</td></tr>";

    res += addBlockersData(server, settings);

    for (var m = 0; m < server.suites.length; m++) {
        var subSuite = server.suites[m];

        res += showSuiteData(subSuite, settings, server.prNum);
    }

    res += "<tr><td colspan='4'>&nbsp;</td></tr>";
    res += "</table>";

    return res;
}

/**
 * Creates table with possible blockers.
 *
 * @param server - see ChainAtServerCurrentStatus Java class.
 * @param settings - see Settings JavaScript class.
 * @returns {string} Table rows with possible blockers and table headers.
 * Or empty string if no blockers found.
 */
function addBlockersData(server, settings) {
    if (findGetParameter("action") !== "Latest")
        return "";

    var blockers = "";

    for (var i = 0; i < server.suites.length; i++) {
        var suite = server.suites[i];

        suite = suiteWithCriticalFailuresOnly(suite);

        if (suite != null)
            blockers += showSuiteData(suite, settings, server.prNum);
    }

    if (blockers === "") {
        blockers = "<tr bgcolor='#D6F7C1'><th colspan='3' class='table-title'>" +
            "<b>Possible Blockers not found!</b></th>" +
            "<th class='table-title'>Base Branch</th></tr>";
    }
    else {
        blockers = "<tr bgcolor='#F5F5FF'><th colspan='3' class='table-title'><b>Possible Blockers</b></th>" +
            "<th class='table-title'>Base Branch</th></tr>" +
            blockers
    }

    blockers += "<tr bgcolor='#F5F5FF'><th colspan='3' class='table-title'><b>All Failures</b></th>" +
        "<th class='table-title'>Base Branch</th></tr>";

    return blockers;
}

/**
 * Copy suite and remove flaky tests from the copy.
 *
 * @param suite - see SuiteCurrentStatus Java class.
 * @returns Suite without flaky tests. Or null - if suite have only flaky tests.
 */
function suiteWithCriticalFailuresOnly(suite) {
    var suite0 = Object.assign({}, suite);
    var j = 0;

    suite0.testFailures = suite0.testFailures.slice();

    while (j < suite0.testFailures.length) {
        var testFailure = suite0.testFailures[j];

        if (isNewFailedTest(testFailure) || testFailure.name.includes("(last started)"))
            j++;
        else
            suite0.testFailures.splice(j, 1);
    }

    if (suite0.testFailures.length > 0 || suite0.result !== "")
        return suite0;

    return null;
}

/**
 * Send POST request to change PR status.
 *
 * @returns {string}
 */
function notifyGit() {
    var server = g_srv_to_notify_git;
    var suites = 0;
    var tests = 0;

    for (let suite of server.suites) {
        if (suite.result != "") {
            suites++;

            continue;
        }

        for (let testFailure of suite.testFailures) {
            if (isNewFailedTest(testFailure))
                tests++;
        }
    }

    var state;
    var desc;

    if (suites === 0 && tests === 0) {
        state = "success";
        desc = "No blockers found.";
    }
    else {
        state = "failure";
        desc = suites + " critical suites, " + tests + " failed tests.";
    }

    var msg = {
        state: state,
        target_url: server.webToHist,
        description: desc,
        context: "TeamCity"
    };

    var notifyGitUrl = "rest/pr/notifyGit"  + parmsForRest();

    $.ajax({
        url: notifyGitUrl,
        type: 'POST',
        data: {notifyMsg: JSON.stringify(msg)},
        success: function(result) {$("#loadStatus").html(result);},
        error: showErrInLoadStatus
    });
}

function triggerBuilds(serverId, parentSuiteId, suiteIdList, branchName, top, observe, ticketId, prNum) {
    var queueAtTop = isDefinedAndFilled(top) && top;
    var observeJira = isDefinedAndFilled(observe) && observe;
    var suiteIdsNotExists = !isDefinedAndFilled(suiteIdList) || suiteIdList.length === 0;
    var branchNotExists = !isDefinedAndFilled(branchName) || branchName.length === 0;
    branchName = branchNotExists ? null : branchForTc(branchName);
    ticketId = (isDefinedAndFilled(ticketId) && ticketId.length > 0) ? ticketId : null;
    prNum = (isDefinedAndFilled(prNum) && prNum.length > 0) ? prNum : null;

    var triggerConfirm = $("#triggerConfirm");

    if (suiteIdsNotExists || branchNotExists) {
        triggerConfirm.html("No " + (suiteIdsNotExists ? "suites" +
            (branchNotExists ? " and branch" : "") : "branch") + " to run!");
        triggerConfirm.dialog({
            modal: true,
            buttons: {
                "Ok" : closeDialog
            }
        });

        return;
    }

    var suites = suiteIdList.split(',');
    var parentSuite = isDefinedAndFilled(parentSuiteId) ? parentSuiteId : suites[0];
    var fewSuites = suites.length > 1;

    var message = "Trigger build" + (fewSuites ? "s" : "") + " at <b>server:</b> " + serverId + "<br>" +
    "<b>Branch:</b> " + branchName + "<br><b>Top:</b> " + top + "<br>" +
    "<b>Suite ID" + (fewSuites ? "s" : "") + ":</b> ";

    for (var i = 0; i < suites.length; i++)
        message += suites[i] + "<br>";

    if (fewSuites) {
        triggerConfirm.html(message);
        triggerConfirm.dialog({
            modal: true,
            buttons: {
                "Run" : function () {
                    $(this).dialog("close");
                    sendGetRequest();
                },
                "Cancel": closeDialog
            }
        });
    } else
        sendGetRequest();

    /**
     * See org.apache.ignite.ci.web.rest.TriggerBuilds#triggerBuilds
     */
    function sendGetRequest() {
        $.ajax({
            url: 'rest/build/trigger',
            data: {
                "serverId": serverId,
                "branchName": branchName,
                "parentSuiteId" : parentSuite,
                "suiteIdList": suiteIdList,
                "top": queueAtTop,
                "observe": observeJira,
                "ticketId": ticketId,
                "prNum": prNum
            },
            success: successDialog,
            error: showErrInLoadStatus
        });
    }

    function successDialog(result) {
        var triggerDialog = $("#triggerDialog");

        triggerDialog.html(message + "<br><b>Result:</b> " + result.result);
        triggerDialog.dialog({
            modal: true,
            buttons: {
                "Ok": closeDialog
            }
        });

        if (loadData && typeof(loadData) === "function")
            loadData();
    }

    function closeDialog() {
        $(this).dialog("close");
    }
}

/**
 * Converts PR number to branch for TeamCity.
 *
 * @param pr - Pull Request number.
 * @returns {String} Branch for TeamCity.
 */
function branchForTc(pr) {
    var regExpr = /(\d*)/i;

    if (regExpr.exec(pr)[0] === pr)
        return "pull/" + regExpr.exec(pr)[0] + "/head";

    return pr;
}

function commentJira(serverId, branchName, parentSuiteId, ticketId) {
    var branchNotExists = !isDefinedAndFilled(branchName) || branchName.length === 0;
    branchName = branchNotExists ? null : branchForTc(branchName);
    ticketId = (isDefinedAndFilled(ticketId) && ticketId.length > 0) ? ticketId : null;

    if (branchNotExists) {
        var triggerConfirm = $("#triggerConfirm");

        triggerConfirm.html("No branch to run!");
        triggerConfirm.dialog({
            modal: true,
            buttons: {
                "Ok" : function () {
                    $(this).dialog("close");
                }
            }
        });

        return;
    }

    $("#notifyJira").html("<img src='https://www.wallies.com/filebin/images/loading_apple.gif' width=20px height=20px>" +
        " Please wait. First action for PR run-all data may require significant time.");

    $.ajax({
        url: 'rest/build/commentJira',
        data: {
            "serverId": serverId,
            "suiteId": parentSuiteId,
            "branchName": branchName,
            "ticketId": ticketId
        },
        success: function(result) {
            $("#notifyJira").html("");

            var needTicketId = result.result.lastIndexOf("enter ticket id") !== -1;

            if (needTicketId) {
                var buttons = {
                    "Retry": function () {
                        $(this).dialog("close");

                        ticketId = $("#enterTicketId").val();

                        commentJira(serverId, branchName, parentSuiteId, ticketId)
                    },
                    "Cancel": function () {
                        $(this).dialog("close");
                    }
                }
            }
            else {
                buttons = {
                    "Ok": function () {
                        $(this).dialog("close");
                    }
                }
            }

            var dialog = $("#triggerDialog");

            dialog.html("Trigger builds at server: " + serverId + "<br>" +
                " Suite: " + parentSuiteId + "<br>Branch:" + branchName +
                "<br><br> Result: " + result.result +
                (needTicketId ? ("<br><br>Enter JIRA ticket number: <input type='text' id='enterTicketId'>") : ""));

            dialog.dialog({
                modal: true,
                buttons: buttons
            });

            loadData(); // should be defined by page
        },
        error: showErrInLoadStatus
    });
}

/**
 * Create html string with table rows, containing suite data.
 *
 * @param suite - see org.apache.ignite.ci.web.model.current.SuiteCurrentStatus Java class.
 * @param settings - see Settings JavaScript class.
 * @param prNum - PR shown, used by triggering.
 * @returns {string} Table rows with suite data.
 */
function showSuiteData(suite, settings, prNum) {
    var moreInfoTxt = "";

    if (isDefinedAndFilled(suite.userCommits) && suite.userCommits !== "") {
        moreInfoTxt += "Last commits from: " + suite.userCommits + " <br>";
    }

    moreInfoTxt += "Duration: " + suite.durationPrintable +
        " (Tests: " + suite.testsDurationPrintable + "," +
        " Timeouts: " + suite.lostInTimeouts + ")<br>";

    var res = "";
    res += "<tr bgcolor='#FAFAFF'><td align='right' valign='top'>";

    var failRateText = "";
    if (isDefinedAndFilled(suite.failures) && isDefinedAndFilled(suite.runs) && isDefinedAndFilled(suite.failureRate)) {
        failRateText += "(fail rate " + suite.failureRate + "%)";

        moreInfoTxt += "Recent fails : "+ suite.failureRate +"% [" + suite.failures + " fails / " + suite.runs + " runs]; <br> " ;

        if(isDefinedAndFilled(suite.failsAllHist) && isDefinedAndFilled(suite.failsAllHist.failures)) {
            moreInfoTxt += "All hist fails: "+ suite.failsAllHist.failureRate +"% [" + suite.failsAllHist.failures + " fails / " + suite.failsAllHist.runs + " runs]; <br> " ;
        }

        if(isDefinedAndFilled(suite.criticalFails) && isDefinedAndFilled(suite.criticalFails.failures)) {
            moreInfoTxt += "Critical recent fails: "+ suite.criticalFails.failureRate + "% [" + suite.criticalFails.failures + " fails / " + suite.criticalFails.runs + " runs]; <br> " ;
        }
    }

    if(isDefinedAndFilled(suite.problemRef)) {
        res += "<span title='"+ suite.problemRef.name +"'>&#128030;</span> "
    }

    var color = failureRateToColor(suite.failureRate);

    if (isDefinedAndFilled(suite.latestRuns)) {
        res += drawLatestRuns(suite.latestRuns) + " ";
    }

    res +="</td><td colspan='2'>";
    res += "<span style='border-color: " + color + "; width:6px; height:6px; display: inline-block; border-width: 4px; color: black; border-style: solid;' title='" + failRateText + "'></span> ";

    res += "<a href='" + suite.webToHist + "'>" + suite.name + "</a> " +
        "[ " + "<a href='" + suite.webToBuild + "' title=''> " +
        "tests " + suite.failedTests + " " + suite.result;

    if (isDefinedAndFilled(suite.warnOnly) && suite.warnOnly.length > 0) {
        res += " warn " + suite.warnOnly.length;
    }

    res += "</a> ]";

    if (isDefinedAndFilled(suite.runningBuildCount) && suite.runningBuildCount !== 0) {
        res += " <img src='https://image.flaticon.com/icons/png/128/2/2745.png' width=12px height=12px> ";
        res += " " + suite.runningBuildCount + " running";
    }
    if (isDefinedAndFilled(suite.queuedBuildCount) && suite.queuedBuildCount !== 0) {
        res += " <img src='https://d30y9cdsu7xlg0.cloudfront.net/png/273613-200.png' width=12px height=12px> ";
        res += "" + suite.queuedBuildCount + " queued";
    }

    var mInfo = "";
    if (isDefinedAndFilled(suite.serverId) && isDefinedAndFilled(suite.suiteId) && isDefinedAndFilled(suite.branchName)) {
        mInfo += " Trigger build: ";
        mInfo += "<a href='javascript:void(0);' ";
        mInfo += " onClick='triggerBuilds(\"" + suite.serverId + "\", null, \"" +
            suite.suiteId + "\", \"" + suite.branchName + "\", false, false, null, \"" + prNum + "\")' ";
        mInfo += " title='trigger build' >queue</a> ";

        mInfo += "<a href='javascript:void(0);' ";
        mInfo += " onClick='triggerBuilds(\"" + suite.serverId + "\", null, \"" +
            suite.suiteId + "\", \"" + suite.branchName + "\", true, false, null, \"" + prNum + "\")' ";
        mInfo += " title='trigger build at top of queue'>top</a><br>";
    }

    mInfo += moreInfoTxt;

    if (isDefinedAndFilled(suite.topLongRunning) && suite.topLongRunning.length > 0) {
        mInfo += "Top long running:<br>";

        mInfo += "<table>";
        for (var i = 0; i < suite.topLongRunning.length; i++) {
            mInfo += showTestFailData(suite.topLongRunning[i], false, settings);
        }
        mInfo += "</table>";
    }

    if (isDefinedAndFilled(suite.warnOnly) && suite.warnOnly.length > 0) {
        mInfo += "Warn Only:<br>";
        mInfo += "<table>";
        for (var i = 0; i < suite.warnOnly.length; i++) {
            mInfo += showTestFailData(suite.warnOnly[i], false, settings);
        }
        mInfo += "</table>";
    }

    if (isDefinedAndFilled(suite.logConsumers) && suite.logConsumers.length > 0) {
        mInfo += "Top Log Consumers:<br>";
        mInfo += "<table>";
        for (var i = 0; i < suite.logConsumers.length; i++) {
            mInfo += showTestFailData(suite.logConsumers[i], false, settings);
        }
        mInfo += "</table>";
    }

    if(!isDefinedAndFilled(findGetParameter("reportMode"))) {
        res += "<span class='container'>";
        res += " <a href='javascript:void(0);' class='header'>" + more + "</a>";
        res += "<div class='content'>" + mInfo + "</div></span>";
    }

    res += "</td>";

    res += "<td>"; //fail rate
    if(isDefinedAndFilled(suite.hasCriticalProblem) && suite.hasCriticalProblem
        && isDefinedAndFilled(suite.criticalFails) && isDefinedAndFilled(suite.criticalFails.failures)) {
        res += "<a href='" + suite.webToHistBaseBranch + "'>";
        res += "Critical F.R.: "+ suite.criticalFails.failureRate + "% </a> " ;
    } else {
        res+="&nbsp;";
    }
    res += "</td>"; //fail rate
    res += " </tr>";

    for (var i = 0; i < suite.testFailures.length; i++) {
        var testFailure = suite.testFailures[i];

        res += showTestFailData(testFailure, true, settings);
    }

    if (isDefinedAndFilled(suite.webUrlThreadDump)) {
        res += "<tr><td colspan='2'></td><td>&nbsp; &nbsp; <a href='" + suite.webUrlThreadDump + "'>";
        res += "<img src='https://cdn2.iconfinder.com/data/icons/metro-uinvert-dock/256/Services.png' width=12px height=12px> ";
        res += "Thread Dump</a>";
        res += "<td>&nbsp;</td>";
        res += "</td></tr>";
    }


    res += "<tr><td>&nbsp;</td><td width='12px'>&nbsp;</td><td colspan='2'></td></tr>";

    return res;
}

/**
 * Check that given test is new.
 *
 * @param testFail - see TestFailure Java class.
 * @returns {boolean} True - if test is new. False - otherwise.
 */
function isNewFailedTest(testFail) {
    if (isDefinedAndFilled(testFail.webIssueUrl))
        return false;

    if (!isDefinedAndFilled(testFail.histBaseBranch) || !isDefinedAndFilled(testFail.histBaseBranch.latestRuns))
        return true;

    var hist = testFail.histBaseBranch;

    if (!isDefinedAndFilled(hist.recent))
        return true;

    var flakyCommentsInBase =
        isDefinedAndFilled(testFail.histBaseBranch.flakyComments)
            ? testFail.histBaseBranch.flakyComments
            : null;

    return Number.parseFloat(hist.recent.failureRate) < 4.0 && flakyCommentsInBase == null;
}

function failureRateToColor(failureRate) {
    var redSaturation = 255;
    var greenSaturation = 0;
    var blueSaturation = 0;

    var colorCorrect = 0;
    if (isDefinedAndFilled(failureRate)) {
        colorCorrect = parseFloat(failureRate);
    }

    if (colorCorrect < 50) {
        redSaturation = 255;
        greenSaturation += colorCorrect * 5;
    } else {
        greenSaturation = 255 - (colorCorrect - 50) * 5;
        redSaturation = 255 - (colorCorrect - 50) * 5;
    }
    return rgbToHex(redSaturation, greenSaturation, blueSaturation);
}


//@param testFail - see TestFailure
function showTestFailData(testFail, isFailureShown, settings) {
    var failRateDefined =
        isDefinedAndFilled(testFail.histBaseBranch)
        && isDefinedAndFilled(testFail.histBaseBranch.recent)
        && isDefinedAndFilled(testFail.histBaseBranch.recent.failureRate);

    var failRate = failRateDefined ? testFail.histBaseBranch.recent.failureRate : null;

    var flakyCommentsInBase =
        isDefinedAndFilled(testFail.histBaseBranch) && isDefinedAndFilled(testFail.histBaseBranch.flakyComments)
            ? testFail.histBaseBranch.flakyComments
            : null;

    if (isFailureShown) {
        if (failRate != null) {
            if (parseFloat(failRate) < settings.minFailRate)
                return ""; //test is hidden

            if (parseFloat(failRate) > settings.maxFailRate)
                return ""; //test is hidden
        }

        if (flakyCommentsInBase != null && settings.hideFlakyFailures)
            return ""; // test is hidder
    }

    var res = "";
    res += "<tr><td align='right' valign='top' colspan='2'>";

    var haveIssue = isDefinedAndFilled(testFail.webIssueUrl) && isDefinedAndFilled(testFail.webIssueText);

    var color = (isFailureShown && failRateDefined)
        ? failureRateToColor(failRate)
        : "white";

    var investigated = isDefinedAndFilled(testFail.investigated) && testFail.investigated;
    if (investigated) {
        res += "<img src='https://d30y9cdsu7xlg0.cloudfront.net/png/324212-200.png' width=11px height=11px> ";
        res += "<span style='opacity: 0.75'> ";
    }

    // has both base and current, draw current latest runs here.
    var comparePage =
        findGetParameter('action') != null
        || (
            isDefinedAndFilled(testFail.histCurBranch) && isDefinedAndFilled(testFail.histCurBranch.latestRuns)
            && isDefinedAndFilled(testFail.histBaseBranch) && isDefinedAndFilled(testFail.histBaseBranch.latestRuns)
        );

    var baseBranchMarks = "";

    if (isFailureShown && flakyCommentsInBase != null) {
        baseBranchMarks += "<span title='" + flakyCommentsInBase + "' style=\"color: #303030; font-size: 125%;\">" + "&#9858;" + "</span> "; //&asymp;
    }

    if (comparePage) {
        var flakyCommentsInCur =
            isDefinedAndFilled(testFail.histCurBranch) && isDefinedAndFilled(testFail.histCurBranch.flakyComments)
                ? testFail.histCurBranch.flakyComments
                : null;

        if(flakyCommentsInCur!=null)
            res += "<span title='" + flakyCommentsInCur + "' style=\"color: #303030; font-size: 125%;\">" + "&#9858;" + "</span> "; //&asymp;
    }
    else {
        res += baseBranchMarks;
    }

    var bold = false;
    if(isFailureShown && isDefinedAndFilled(testFail.problemRef)) {
        res += "<span title='"+testFail.problemRef.name +"'>&#128030;</span>";
        if(!bold)
           res += "<b>";

        bold = true;
    }

    var haveWeb = isDefinedAndFilled(testFail.webUrl);
    if (haveWeb)
        res += "<a href='" + testFail.webUrl + "'>";

    if(comparePage) {
        if (isDefinedAndFilled(testFail.histCurBranch))
            res += drawLatestRuns(testFail.histCurBranch.latestRuns);
    } else if(isDefinedAndFilled(testFail.histBaseBranch) && isDefinedAndFilled(testFail.histBaseBranch.latestRuns))
        res += drawLatestRuns(testFail.histBaseBranch.latestRuns); // has only base branch

    if (haveWeb)
        res += "</a> ";

    res += "</td><td valign='top'>";
    res += "<span style='background-color: " + color + "; width:8px; height:8px; display: inline-block; border-width: 1px; border-color: black; border-style: solid; '></span> ";

    if (isDefinedAndFilled(testFail.curFailures) && testFail.curFailures > 1)
        res += "[" + testFail.curFailures + "] ";

    if (haveIssue) {
        res += "<a href='" + testFail.webIssueUrl + "'>";
        res += testFail.webIssueText;
        res += "</a>";
        res += ": ";
    }

    if (isDefinedAndFilled(testFail.suiteName) && isDefinedAndFilled(testFail.testName))
        res += "<font color='grey'>" + testFail.suiteName + ":</font> " + testFail.testName;
    else
        res += testFail.name;

    var histContent = "";

    //see class TestHistory
    var hist;

    if(isDefinedAndFilled(testFail.histBaseBranch))
        hist = testFail.histBaseBranch;
    else
        hist = null;

    if (isFailureShown && hist!=null) {
        if(comparePage)  {
             histContent += baseBranchMarks + " ";
        }

        var testFailTitle = "";

        if(isDefinedAndFilled(hist.recent) && isDefinedAndFilled(hist.recent.failures))
            testFailTitle = "recent rate: " + hist.recent.failures + " fails / " + hist.recent.runs + " runs" ;

        if(isDefinedAndFilled(hist.allTime) && isDefinedAndFilled(hist.allTime.failures)) {
            testFailTitle +=
                 "; all history: " + hist.allTime.failureRate + "% ["+
                  hist.allTime.failures + " fails / " +
                  hist.allTime.runs + " runs] " ;
        }

        histContent += " <span title='" +testFailTitle + "'>";
        
        if (isDefinedAndFilled(hist.recent) && isDefinedAndFilled(hist.recent.failureRate))
            histContent += "(fail rate " + hist.recent.failureRate + "%)";
        else
            histContent += "(no data)";

        histContent += "</span>";

        if(comparePage && isDefinedAndFilled(testFail.histBaseBranch) && isDefinedAndFilled(testFail.histBaseBranch.latestRuns))  {
             histContent += " " + drawLatestRuns(testFail.histBaseBranch.latestRuns); // has both base and current, draw current base runs here.
        }
    } else if (haveWeb) {
        histContent += " (test history)";
    }


    if (!isFailureShown && isDefinedAndFilled(testFail.durationPrintable))
        res += " duration " + testFail.durationPrintable;

    if (bold)
        res += "</b>";

    if (investigated)
        res += "</span> ";


    if (isDefinedAndFilled(testFail.warnings) && testFail.warnings.length > 0
        && !isDefinedAndFilled(findGetParameter("reportMode"))) {
        res += "<span class='container'>";
        res += " <a href='javascript:void(0);' class='header'>" + more + "</a>";

        res += "<div class='content'>";

        res += "<p class='logMsg'>";
        for (var i = 0; i < testFail.warnings.length; i++) {
            res += "&nbsp; &nbsp; ";
            res += "&nbsp; &nbsp; ";
            res += testFail.warnings[i];
            res += " <br>";
        }
        res += "</p>";

        res += "</div></span>";

    }


    res += "<td>";

    var haveBaseBranchWeb = isDefinedAndFilled(testFail.webUrlBaseBranch);
    if (haveBaseBranchWeb)
        res += "<a href='" + testFail.webUrlBaseBranch + "'>";

    res += histContent;

    if (haveBaseBranchWeb)
        res += "</a>";

    res += "&nbsp;</td>";

    res += "</td></tr>";

    return res;
}

function drawLatestRuns(latestRuns) {
    if(isDefinedAndFilled(findGetParameter("reportMode")))
        return "";

    var res = "";
    res += "<nobr><span style='white-space: nowrap; width:" + (latestRuns.length  * 1) + "px; display: inline-block;' " +
        "title='Latest master runs history from right to left is oldest to newest." +
        " Red-failed,green-passed,black-critical failure'>";

    var len = 1;
    var prevState = null;
    for (var i = 0; i < latestRuns.length; i++) {
        var runCode = latestRuns[i];

        if (prevState == null) {
            //skip
        } else if (prevState === runCode) {
            len++;
        } else {
            res += drawLatestRunsBlock(prevState, len);
            len = 1;
        }

        prevState = runCode;
    }
    if (prevState != null) {
        res += drawLatestRunsBlock(prevState, len);
    }
    res += "</span></nobr>";

    return res;
}

function drawLatestRunsBlock(state, len) {
    var runColor = "white";

    if (state === 0)
        runColor = "green";
    else if (state === 1)
        runColor = "red";
    else if (state === 2)
        runColor = "grey";
    else if (state === 3)
        runColor = "black";

    return "<span style='background-color: " + runColor + "; width:" + (len * 1) + "px; height:10px; display: inline-block;'></span>";
}