package org.apache.ignite.ci.issue;

import java.util.*;

public class Notification {
    String addr;
    Long ts;

    Map<Integer, List<Issue>> buildIdToIssue = new TreeMap<>(Comparator.reverseOrder());

    public void addIssue(Issue issue) {
        Integer buildId = issue.issueKey.buildId;

        buildIdToIssue.computeIfAbsent(buildId, b -> new ArrayList<>()).add(issue);
    }

    public String toHtml() {
        StringBuilder sb = new StringBuilder();

        sb.append(messageHeader());

        for (Map.Entry<Integer, List<Issue>> nextEntry : buildIdToIssue.entrySet()) {
            List<Issue> issues = nextEntry.getValue();

            for (Iterator<Issue> iterator = issues.iterator(); iterator.hasNext(); ) {
                Issue next = iterator.next();
                String color = "blue";

                sb.append("<span style='border-color: ")
                    .append(color)
                    .append("; width:0px; height:0px; display: inline-block; border-width: 4px; color: black; border-style: solid;'></span>");

                sb.append("    ");
                sb.append(next.toHtml(!iterator.hasNext()));
                sb.append("<br>");
            }

            sb.append("<br>");
        }

        sb.append(messageTail());

        return sb.toString();
    }

    private String messageHeader() {
        return "Hi Ignite Developer,<br><br>" +
            "I am MTCGA.Bot, and I've detected some issue on TeamCity to be addressed. I hope you can help.<br><br>";
    }

    private String messageTail() {

        //GetTrackedBranches getTrackedBranches = new GetTrackedBranches();
        //Version version = getTrackedBranches.version();

        StringBuilder sb = new StringBuilder();

        sb.append("<ul><li>If your changes can led to this failure(s), please create issue with label MakeTeamCityGreenAgain and assign it to you.");

        sb.append("<ul><li>If you have fix, please set ticket to PA state and write to dev list fix is ready</li>");
        sb.append("<li>For case fix will require some time please mute test and set label Muted_Test to issue</li>");
        sb.append("</ul></li>");

        sb.append("<li>If you know which change caused failure please contact change author directly</li>");
        sb.append("<li>If you don't know which change caused failure please send message to dev list to find out</li></ul><br>");

        sb.append("Should you have any questions please contact dpavlov@apache.org or write to dev.list<br><br>");

        sb.append("BR,<br> MTCGA.Bot<br>");

        sb.append("Notification generated at ").append(new Date(ts).toString()).append( "<br>");
        return sb.toString();
    }

    public String countIssues() {
        return "";
    }

    public List<String> toSlackMarkup() {
        List<String> res = new ArrayList<>();

        for (Map.Entry<Integer, List<Issue>> nextEntry : buildIdToIssue.entrySet()) {
            List<Issue> issues = nextEntry.getValue();

            res.add(toSlackMarkup(issues));
        }

        return res;
    }

    private String toSlackMarkup(List<Issue> issues) {
        StringBuilder sb = new StringBuilder();

        sb.append(":warning: ");

        for (Iterator<Issue> iter = issues.iterator(); iter.hasNext(); ) {
            Issue next = iter.next();
            sb.append(next.toSlackMarkup(!iter.hasNext()));

            sb.append("\n");
        }

        return sb.toString();
    }

}
