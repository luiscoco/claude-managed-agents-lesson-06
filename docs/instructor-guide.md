# Instructor guide

Begin with one parent session and its primary thread. In the current Managed Agents model, children come from managed execution, such as multiagent work or a workflow run. The explorer discovers existing threads; it does not create arbitrary chat tabs through a nonexistent thread-create endpoint.

Run the demo walkthrough. With page size two, four threads are still discovered. Select the research reviewer and inspect the paired IDs, parent_thread_id, and status. Compare troubleshooting: both belong to the project session, but each snapshot keeps its own focused history. This organization does not establish security isolation or guarantee scheduling behavior.

Watch the research update. Identify event_start, event_delta, the complete agent.message, and session.thread_status_idle. The final replaces its preview. A child’s idle reason is not proof the parent or all siblings are done. Live observation waits for actual future activity and starts no work.

Stop observation during another watch. The control closes only the local stream; it sends no user.interrupt. Reopen to demonstrate stream-before-history recovery and duplicate-ID suppression. Preview envelopes disappear from a later persisted-history read. Thinking content is not displayed.

Switch to the API design parent. List its threads before selecting a reviewer. Explain why a cached view or request must include both IDs and why using a display label as a key would mix unrelated content.

Demonstrate archival on a demo child with exact ARCHIVE-ID confirmation. The API requires idle. The explorer additionally protects primary and workflow-run threads as application guards. The walkthrough never archives automatically. Read the retained history afterward, then Reset demo fixtures for another student. There is no delete control.

Use all 12 highlighted API/parameter cards and eight selectable UML steps. Contrast thread list statuses/limit with thread event list, whose pinned SDK signature has no order parameter. Finish with the six-question quiz.

For live mode, configure an existing session ID and a credential with access to it. A single-agent session may expose only the primary thread. The app makes no new inference request; existing managed work may still incur usage. Archival is the one deliberate cloud mutation.
