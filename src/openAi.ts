import { OpenAI } from "openai";
import type { ChatCompletionCreateParamsBase } from "openai/src/resources/chat/completions";

type Model = ChatCompletionCreateParamsBase["model"];

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const MAX_OPEN_AI_QUERY_LENGTH = 20000;
export const MODEL_NAME: Model =
  process.env.INPUT_OPENAI_MODEL ?? "gpt-3.5-turbo";
export const TEMPERATURE = 0.5;
export const MAX_TOKENS = 512;

export const openai = client;
