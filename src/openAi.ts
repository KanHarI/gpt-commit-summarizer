import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // This is the default and can be omitted
});

export const MAX_OPEN_AI_QUERY_LENGTH = 20000;
export const MODEL_NAME = "gpt-4o-mini";
export const TEMPERATURE = 0.5;
export const MAX_TOKENS = 512;

