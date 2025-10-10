# Introducing Stagehand

Developers use **Stagehand** to ***reliably*** automate the web.

> #### Stagehand is designed for developers building production browser automations and AI agents that need reliable web access.

Stagehand is a browser automation framework used to control web browsers with natural language and code. By combining the power of AI with the precision of code, Stagehand makes web automation flexible, maintainable, and actually reliable.

## The Problem with Browser Automation

Traditional frameworks like Playwright and Puppeteer force you to write brittle scripts that break with every UI change. Web agents promise to solve this with AI, but leave you at the mercy of unpredictable behavior.**You’re stuck between two bad options:**

- **Too brittle**: Traditional selectors break when websites change
- **Too agentic**: AI agents are unpredictable and impossible to debug

## Enter Stagehand

Stagehand gives you the best of both worlds through four powerful primitives that let you choose exactly how much AI to use:

## Act

Execute actions using natural language

## Extract

Pull structured data with schemas

## Observe

Discover available actions on any page

## Agent

Automate entire workflows autonomously

```typescript
// Act - Execute natural language actions
await page.act("click the login button");

// Extract - Pull structured data
const { price } = await page.extract({
  schema: z.object({ price: z.number() })
});

// Observe - Discover available actions
const actions = await page.observe("find submit buttons");

// Agent - Automate entire workflows
const agent = stagehand.agent({
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    options: {
      apiKey: process.env.ANTHROPIC_API_KEY,
    },
})
await agent.execute("apply for this job");

```

## Why Developers Choose Stagehand
**Precise Control:** 
Mix AI-powered actions with deterministic code. You decide exactly how much AI to use.

**Actually Repeatable:** 
Save and replay actions exactly. No more “it worked on my machine” with browser automations.

**Maintainable at Scale:** 
One script can automate multiple websites. When sites change, your automations adapt.

**Composable Tools:** 
Choose your level of automation with Act, Extract, Observe, and Agent.

## Built for Modern Development

Stagehand is designed for developers building production browser automations and AI agents that need reliable web access.