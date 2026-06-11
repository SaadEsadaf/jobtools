require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const express = require('express')
const cors = require('cors')
const path = require('path')

const app = express()
const PORT = process.env.PORT || 3002

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.static(path.join(__dirname, '..', 'client', 'public')))

const authRoutes = require('./routes/auth')
const statsRoutes = require('./routes/stats')
const leadsRoutes = require('./routes/leads')
const campaignsRoutes = require('./routes/campaigns')
const templatesRoutes = require('./routes/templates')
const brainRoutes = require('./routes/brain')

app.use('/api/auth', authRoutes)
app.use('/api/stats', statsRoutes)
app.use('/api/leads', leadsRoutes)
app.use('/api/campaigns', campaignsRoutes)
app.use('/api/templates', templatesRoutes)
app.use('/api/brain', brainRoutes)

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'public', 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`JobTools Marketing Lab running on port ${PORT}`)
})
