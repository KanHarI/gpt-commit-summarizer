import { Configuration, OpenAIApi } from 'openai'

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
})

export const MAX_OPEN_AI_QUERY_LENGTH = 20000
export const MODEL_NAME = 'text-davinci-003'
export const TEMPERATURE = 0.5
export const MAX_TOKENS = 512

export const openai = new OpenAIApi(configuration)
