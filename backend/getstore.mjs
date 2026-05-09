import dotenv from 'dotenv'
dotenv.config()
import axios from 'axios'

const r = await axios.get('https://api.lemonsqueezy.com/v1/stores', {
  headers: { 'Authorization': `Bearer ${process.env.LEMONSQUEEZY_API_KEY}` }
})
console.log('Store ID:', r.data.data[0].id)