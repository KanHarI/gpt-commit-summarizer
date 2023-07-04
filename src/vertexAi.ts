import { helpers, PredictionServiceClient } from "@google-cloud/aiplatform";
import assert from "assert";

// Specifies the location of the api endpoint
const clientOptions = {
  apiEndpoint: "us-central1-aiplatform.googleapis.com",
};

export const MAX_AI_QUERY_LENGTH = 15000;
const MODEL_NAME = "text-bison@001";
const TEMPERATURE = 0.5;
const MAX_TOKENS = 1024;
let project = "";
export function setProject(_project: string) {
  project = _project;
}
function getEndpoint(): string {
  assert(project != "", "Google Cloud Project not set");
  return `projects/${project}/locations/us-central1/publishers/google/models/${MODEL_NAME}`;
}

const client = new PredictionServiceClient(clientOptions);

interface AIPrediction {
  citationMetadata: string;
  content: string;
  safetyAttributes: {
    blocked: boolean;
    categories: string[];
    scores: number[];
  };
}

export const predict = async (
  basePrompt: string,
  prompt: string = "",
  glue = ""
): Promise<string> => {
  const parameter = {
    temperature: TEMPERATURE,
    maxOutputTokens: MAX_TOKENS,
    topK: 1,
    topP: 0,
  };
  if (prompt.length > MAX_AI_QUERY_LENGTH) {
    // Split the prompt into multiple parts on the closest newline
    const promptParts = prompt.split("\n");
    let reconstructedPrompt = "";
    let responses: string[] = [];
    for (let i = 0; i < promptParts.length; i++) {
      if (promptParts[i].length > MAX_AI_QUERY_LENGTH) {
        console.warn(
          `Warning: prompt part ${promptParts[i]} is too long (${promptParts[i].length} characters).`
        );
      }
      if (
        reconstructedPrompt.length + promptParts[i].length >
        MAX_AI_QUERY_LENGTH
      ) {
        // If the next part would make the prompt too long, then predict on the current prompt
        responses.push(await predict(basePrompt, reconstructedPrompt, glue));
        reconstructedPrompt = "";
      }
      reconstructedPrompt += promptParts[i] + "\n";
    }
    return responses.join("\n");
  }

  const instance = helpers.toValue({
    prompt: basePrompt + "\n" + prompt + "\n" + glue,
  });
  const instances = [instance] as any[];
  const parameters = helpers.toValue(parameter);
  const response = await new Promise<AIPrediction>((resolve, reject) => {
    client
      .predict({ instances, endpoint: getEndpoint(), parameters })
      .then((value) => {
        if (
          value[0] != null &&
          value[0].predictions != null &&
          value[0].predictions.length > 0
        ) {
          const result: AIPrediction = helpers.fromValue(
            value[0].predictions[0] as any
          ) as any;
          resolve(result);
        } else {
          reject(
            `Error: couldn't generate summary because of an unknown error: ${JSON.stringify(
              value
            )}`
          );
        }
      })
      .catch((reason) => {
        reject(reason);
      });
  });
  return response.content;
};
