import { Application } from './application'

function run(): void {
  if (!process.env.WEBHOOK_SECRET) {
    throw new Error("Expected environment variable 'WEBHOOK_SECRET'")
  }

  const app = new Application({
    secret: process.env.WEBHOOK_SECRET,
  })

  app.initialize()
  app.start(process.env.WEBHOOK_PROXY_URL)
}

run()
