import { Application } from '@ploys/deployments-core'

function run(): void {
  if (!process.env.APP_ID) {
    throw new Error("Expected environment variable 'APP_ID'")
  }

  if (!process.env.PRIVATE_KEY) {
    throw new Error("Expected environment variable 'PRIVATE_KEY'")
  }

  if (!process.env.WEBHOOK_SECRET) {
    throw new Error("Expected environment variable 'WEBHOOK_SECRET'")
  }

  const id = Number.parseInt(process.env.APP_ID)
  const secret = process.env.WEBHOOK_SECRET
  const privateKey = JSON.parse(`"${process.env.PRIVATE_KEY}"`)

  const app = new Application({ id, secret, privateKey })

  app.initialize()
  app.start(process.env.WEBHOOK_PROXY_URL)
}

run()
