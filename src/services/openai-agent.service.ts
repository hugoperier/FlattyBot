// import { z } from "zod";
// import { RunContext, Agent, AgentInputItem, Runner, withTrace } from "@openai/agents";

// const MyAgentSchema = z.object({});
// interface MyAgentContext {
//     workflowInputAsText: string;
// }
// const myAgentInstructions = (runContext: RunContext<MyAgentContext>, _agent: Agent<MyAgentContext>) => {
//     const { workflowInputAsText } = runContext.context;
//     return `You are a helpful assistant. ${workflowInputAsText}`
// }
// const myAgent = new Agent({
//     name: "My agent",
//     instructions: myAgentInstructions,
//     model: "gpt-5-nano",
//     outputType: MyAgentSchema,
//     modelSettings: {
//         reasoning: {
//             effort: "low"
//         },
//         store: true
//     }
// });

// type WorkflowInput = { input_as_text: string };


// // Main code entrypoint
// export const runWorkflow = async (workflow: WorkflowInput) => {
//     return await withTrace("New workflow", async () => {
//         const conversationHistory: AgentInputItem[] = [
//             { role: "user", content: [{ type: "input_text", text: workflow.input_as_text }] }
//         ];
//         const runner = new Runner({
//             traceMetadata: {
//                 __trace_source__: "agent-builder",
//                 workflow_id: "wf_6921036b9fa88190bc9d5ff724f6cd53042d428a02278864"
//             }
//         });
//         const myAgentResultTemp = await runner.run(
//             myAgent,
//             [
//                 ...conversationHistory
//             ],
//             {
//                 context: {
//                     workflowInputAsText: workflow.input_as_text
//                 }
//             }
//         );
//         conversationHistory.push(...myAgentResultTemp.newItems.map((item: { rawItem: any; }) => item.rawItem));

//         if (!myAgentResultTemp.finalOutput) {
//             throw new Error("Agent result is undefined");
//         }

//         const myAgentResult = {
//             output_text: JSON.stringify(myAgentResultTemp.finalOutput),
//             output_parsed: myAgentResultTemp.finalOutput
//         };
//     });
// }
