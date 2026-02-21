import dotenv from 'dotenv'
import path from 'path'

// Load backend/.env — single source of truth for all backend config
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

import app from './app'
import { startScheduler } from './services/scheduler'

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  startScheduler()
})

export default app
