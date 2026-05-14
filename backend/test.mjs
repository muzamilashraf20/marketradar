import { GoogleGenerativeAI } from '@google/generative-ai'
import dotenv from 'dotenv'
dotenv.config()
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const model = gemini.getGenerativeModel({ model: 'gemini-2.0-flash' })
const result = await model.generateContent('Say hello')
console.log('SUCCESS:', result.response.text())
