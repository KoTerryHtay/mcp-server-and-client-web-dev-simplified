import "dotenv/config";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { confirm, input, select } from "@inquirer/prompts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  CreateMessageRequestSchema,
  Prompt,
  PromptMessage,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { generateText, jsonSchema, ToolSet } from "ai";

const mcp = new Client(
  {
    name: "text-client-video",
    version: "1.0.0",
  },
  { capabilities: { sampling: {} } }
);

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const transport = new StdioClientTransport({
  command: "node",
  args: ["build/server.js"],
  stderr: "ignore",
});

async function main() {
  await mcp.connect(transport);
  const [{ tools }, { prompts }, { resources }, { resourceTemplates }] =
    await Promise.all([
      mcp.listTools(),
      mcp.listPrompts(),
      mcp.listResources(),
      mcp.listResourceTemplates(),
    ]);

  mcp.setRequestHandler(CreateMessageRequestSchema, async (request) => {
    const texts: string[] = [];
    console.log(
      "mcp.setRequestHandler(CreateMessageRequestSchema // \n request.params.messages >>>",
      request.params.messages
    );
    for (const message of request.params.messages) {
      const text = await handleServerMessagePrompt(message);
      if (text != null) texts.push(text);
    }

    console.log(
      "setRequestHandler(CreateMessageRequestSchema texts[] >>>",
      texts
    );

    return {
      role: "user",
      model: "gemini-2.0-flash",
      stopReason: "endTurn", // this is the end of the client's interactions and it's back to the server.
      content: {
        type: "text",
        text: texts.join("\n"),
      },
    };
  });

  console.log("You are connected!");

  while (true) {
    const option = await select({
      message: "What would you like to do",
      choices: ["Query", "Tools", "Resources", "Prompts"],
    });

    switch (option) {
      case "Tools":
        const toolName = await select({
          message: "Select a tool",
          choices: tools.map((tool) => ({
            name: tool.annotations?.title || tool.name,
            value: tool.name,
            description: tool.description,
          })),
        });
        console.log("toolName >>>", toolName);
        const tool = tools.find((t) => t.name === toolName);
        if (tool === null) {
          console.error("Tool not found");
        } else {
          await handleTool(tool!);
        }
      case "Resources":
        const resourceUri = await select({
          message: "Select a resource",
          choices: [
            ...resources.map((resource) => ({
              name: resource.name,
              value: resource.uri,
              description: resource.description,
            })),
            ...resourceTemplates.map((template) => ({
              name: template.name,
              value: template.uriTemplate,
              description: template.description,
            })),
          ],
        });

        console.log("resourceUri >>>", resourceUri);

        const uri =
          resources.find((r) => r.uri === resourceUri)?.uri ??
          resourceTemplates.find((r) => r.uriTemplate === resourceUri)
            ?.uriTemplate;
        if (uri === null) {
          console.error("Resource not found");
        } else {
          await handleResource(uri!);
        }
      case "Prompts":
        const promptName = await select({
          message: "Select a prompt",
          choices: prompts.map((prompt) => ({
            name: prompt.name,
            value: prompt.name,
            description: prompt.description,
          })),
        });

        console.log("promptName >>>", promptName);

        const prompt = prompts.find((p) => p.name === promptName);

        if (prompt === null) {
          console.error("Prompt not found");
        } else {
          await handlePrompt(prompt!);
        }
      case "Query":
        await handleQuery(tools);
    }
  }
}

async function handleQuery(tools: Tool[]) {
  const query = await input({ message: "Enter your query" });

  const { text, toolResults } = await generateText({
    model: google("gemini-2.0-flash"),
    prompt: query,
    tools: tools.reduce((obj, tool) => {
      console.log("tool >>>", tool);

      return {
        ...obj,
        [tool.name]: {
          description: tool.description,
          parameters: jsonSchema(tool.inputSchema),
          execute: async (args: Record<string, any>) => {
            console.log("prompt: query >>>", query);
            console.log("execute args >>>", args);
            return await mcp.callTool({
              name: tool.name,
              arguments: args,
            });
          },
        },
      };
    }, {} as ToolSet),
  });

  console.log("text >>>", text || "No text generate");

  console.log(
    "toolResults[0]?.result?.content[0]?.text >>>",
    // @ts-expect-error
    toolResults[0]?.result?.content[0]?.text || "No text generate"
  );
}

async function handleTool(tool: Tool) {
  const args: Record<string, string> = {};

  console.log(
    "handleTool -> tool.inputSchema.properties >>>",
    tool.inputSchema.properties
  );

  for (const [key, value] of Object.entries(
    tool.inputSchema.properties ?? {}
  )) {
    args[key] = await input({
      message: `Enter value for ${key} (${(value as { type: string }).type})`,
    });
  }

  console.log("handleTool args >>>", args);

  const res = await mcp.callTool({
    name: tool.name,
    arguments: args,
  });

  console.log("res.content >>>", (res.content as [{ text: string }])[0].text);
}

async function handleResource(uri: string) {
  let finalUri = uri;
  console.log("uri >>>", uri);

  const paramMatches = uri.match(/{([^}]+)}/g);

  console.log("paramMatches >>>", paramMatches);

  if (paramMatches !== null) {
    for (const paramMatch of paramMatches) {
      const paramName = paramMatch.replace("{", "").replace("}", "");

      const paramValue = await input({
        message: `Enter value for ${paramName}`,
      });
      console.log("paramValue >>>", paramValue);
      finalUri = finalUri.replace(paramMatch, paramValue);
    }
  }

  const res = await mcp.readResource({
    uri: finalUri,
  });

  console.log(
    "res.contents[0].text >>>",
    JSON.stringify(JSON.parse(res.contents[0].text as string), null, 2)
  );
}

async function handlePrompt(prompt: Prompt) {
  const args: Record<string, string> = {};

  for (const arg of prompt.arguments ?? []) {
    args[arg.name] = await input({
      message: `Enter value for ${arg.name}`,
    });
  }

  const response = await mcp.getPrompt({
    name: prompt.name,
    arguments: args,
  });

  console.log("response.messages >>>", response.messages);

  for (const message of response.messages) {
    {
      console.log(
        "handleServerMessagePrompt >>>",
        await handleServerMessagePrompt(message)
      );
    }
  }
}

async function handleServerMessagePrompt(message: PromptMessage) {
  if (message.content.type !== "text") return;

  console.log("message.content.text >>>", message.content.text);

  const run = await confirm({
    message: "Would you like to run the above prompt",
    default: true,
  });

  if (!run) return;

  const { text } = await generateText({
    model: google("gemini-2.0-flash"),
    prompt: message.content.text,
  });

  console.log("generateText >>>", text);

  return text;
}

main();
