<div align="center">

# OmniScope
### AI-Powered Financial Operating System

*Institutional-grade Wealth Intelligence for Every Retail Investor.*

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38BDF8?logo=tailwindcss)
![License](https://img.shields.io/badge/License-MIT-green)
[![CI](https://github.com/devenmundada/omniscope/actions/workflows/ci.yml/badge.svg)](https://github.com/devenmundada/omniscope/actions/workflows/ci.yml)

---

### 🏆 Securities Market TechSprint @ GFF 2026

OmniScope reimagines how retail investors interact with their financial life by combining AI, portfolio intelligence, behavioral finance, financial education, and multi-asset investing into one seamless experience.

</div>

---

# 📖 Overview

Traditional investing platforms show **data**.

OmniScope delivers **understanding**.

Instead of asking users to interpret charts, numbers, and transactions, OmniScope acts as an intelligent financial companion that explains:

- What happened
- Why it happened
- What it means
- What should happen next

Our mission is simple:

> **Help people make better financial decisions every day.**

---

# ✨ Features

## 🏠 AI Dashboard

- Today's Financial Overview
- Portfolio Summary
- Financial Health Score
- Goal Progress
- AI Insights
- Wealth Snapshot

---

## 📊 Portfolio Intelligence

- Portfolio Allocation
- Holdings Overview
- Performance Tracking
- Diversification Analysis
- Contextual AI Explanations

---

## 🔍 Portfolio X-Ray

Institutional-grade portfolio analytics.

### Features

- Look-through Holdings
- Fund Overlap Detection
- Market Cap Distribution
- Dependency Graph
- Sector Exposure
- Hidden Exposure Analysis

Upcoming

- Treemap
- Sankey Diagram
- Risk Radar
- Correlation Matrix
- Geographic Exposure

---

## 🤖 AI Mentor

Not a chatbot.

A financial mentor.

Features

- Portfolio Analysis
- Goal Guidance
- Investment Explanations
- Financial Coaching
- AI Conversations
- Streaming Responses

---

## 🧬 Wealth DNA

Understand yourself as an investor.

Includes

- Investor Archetype
- Risk Style
- Decision Style
- Diversification Style
- Learning Style
- Communication Style
- Strengths
- Growth Areas
- AI Reflection

---

## 📖 Wealth Journey

A financial autobiography.

Track

- Milestones
- Achievements
- Lessons Learned
- Financial Growth
- AI Reflections

---

## 🔮 Future Self

Visualize your financial future.

Includes

- Scenario Planning
- Future Net Worth Projection
- Trade-offs
- Educational Insights
- AI Recommendations

---

## ❤️ Financial Health

Beyond net worth.

Measure

- Financial Health Score
- Monthly Evolution
- Behavioral Storytelling
- AI Explanations

---

## 🎯 Goal Intelligence

Smart goal management.

Features

- Success Probability
- Risk Factors
- Required Monthly SIP
- AI Suggestions
- Expandable Goal Timeline

---

## 📚 Learning Hub

Learn investing visually.

Features

- Interactive Skill Tree
- Progressive Learning
- AI Recommendations
- Knowledge Timeline

---

## 🌍 Market Intelligence

Not another news feed.

Every event answers:

- Why does this matter?
- How does this affect me?
- What should I learn?
- Do I need to act?

---

## 🧠 Contextual AI

AI exists throughout the product.

Portfolio

↓

AI explains Portfolio

Health

↓

AI explains Health

Goals

↓

AI explains Goals

Learning

↓

AI recommends Learning

Market

↓

AI interprets Events

---

## 📐 Risk Lab

Institutional risk analytics on the user's own holdings, from two years of verified daily prices.

- Annual return (CAGR), volatility, Sharpe and Sortino ratios
- Worst drawdown with dates, and an "underwater" chart
- Beta and Jensen's alpha against the Nifty 50
- Historical and parametric 95% Value-at-Risk and CVaR, in rupees
- Euler risk contributions: each holding's share of money vs share of risk
- Correlation heatmap
- **Markowitz optimiser**: long-only efficient frontier with a per-holding cap, Ledoit–Wolf shrunk covariance and expected returns shrunk towards long-run asset-class returns; max-Sharpe, min-variance and same-risk-more-return portfolios with the trades they imply
- **Crash tests**: 2008, 2020 and 2022 scenarios (or custom Nifty and gold shocks) applied through each holding's two-factor (Nifty, gold) regression betas, with recovery time

The AI Copilot can run the same engine through three tools: `getRiskReport`, `optimizePortfolio` and `stressTestPortfolio`.

## 🗣️ Hindi Copilot with Voice

- English / हिन्दी switch: in Hindi the Copilot answers in Devanagari, keeps terms like SIP, XIRR and NAV in English, and writes amounts as ₹7.43 लाख so every figure stays checkable
- Ask by voice (browser speech recognition, `en-IN` or `hi-IN`) with live transcription
- Listen to any answer read aloud in an Indian English or Hindi voice
- The benchmark includes five Hindi questions that must answer in Hindi with exact figures

---

## 📒 Transaction Ledger

- Record buys (in instalments), sells, bonus shares and splits per holding
- FIFO lots, as for demat holdings: each lot keeps its own holding period; bonus shares cost zero from allotment; splits keep lot dates
- Holdings (units, average cost, first purchase date) are re-derived from the ledger
- The Tax Centre taxes each lot separately and counts long-term gains already booked this year against the ₹1.25 lakh exemption

---

## 🖨️ Portfolio Report

`/report` produces an A4, print-ready report (print or save as PDF): key observations, holdings, allocation, two-year risk, goal odds, capital-gains tax and financial health.

---

## 🎯 Goal-Based Optimiser

Markowitz finds the most return for each level of risk; a goal needs enough return, reliably, by a deadline. For every portfolio on the efficient frontier, each goal is simulated by Monte Carlo and the mix with the highest probability of success is chosen.

- Probability-versus-risk curves per goal: near goals peak at moderate risk, distant goals favour growth
- Best mix per goal, and one mix for all goals (highest average or protect the weakest goal) with the trades it implies
- Return each goal needs, and the SIP for a 70/80/90% chance with the best mix
- Goal projections everywhere now use the same risk model (shrunk returns, Ledoit–Wolf covariance of the actual holdings)

The Copilot answers through the `optimizeForGoals` tool.

---

## 🧾 Tax Centre

Capital-gains tax for Indian investors under the rules in force since 23 July 2024.

- Tax if every holding were sold today: 20% short-term and 12.5% long-term equity (above the ₹1.25 lakh yearly exemption), 12.5% long-term for gold ETFs, Gold Bonds and international funds, slab rate otherwise, plus 4% cess
- Loss set-off in the order that minimises tax; losses left to carry forward
- Each holding's status and the exact day it turns long-term (12 months listed, 24 months unlisted)
- **Gain harvesting**: which units to sell and rebuy to book gains up to the exemption tax-free
- **Wait to save**: short-term gains that turn long-term within 120 days, and the tax saved by waiting
- **Loss harvesting**: unrealised losses and the tax they could offset
- Slab rate estimated from profile income under the new regime; purchase dates can be added inline

The Copilot answers tax questions through the `getTaxEstimate` tool.

---

# 🚀 Tech Stack

| Layer | Technology |
|---|---|
| App | Next.js 16 (App Router, server components), React 19, TypeScript |
| UI | Tailwind CSS v4, shadcn/ui, Framer Motion, Recharts, React Flow, cmdk |
| Data | PostgreSQL on Supabase (Mumbai), Drizzle ORM, transaction pooler |
| Auth | Supabase Auth, per-user scoping on every personal-data query |
| AI | Vercel AI SDK v7 with Google Gemini (3.5 Flash-Lite, 3.1 Flash-Lite fallback), tool calling, Zod structured output |
| Hosting | Vercel (Mumbai region) with a weekday price-sync cron |
| Tests | Vitest unit tests for every maths engine |

---

# 🏗️ Architecture

```
Sources                Ingestion                 Storage                 Engines                    AI layer                 User
NSE bhavcopy     ──►   daily Vercel cron   ──►   Postgres (Supabase) ──► XIRR (Newton–Raphson) ──►  Gemini + 14 tools   ──►  Dashboard
AMFI NAV file          bonus/split cleaning      2-year price history    Monte Carlo goals          grounded answers         Risk Lab
gold-api + ECB FX      source fallbacks          per-user holdings       Health score, HHI          model fallback           Goals, Health
Google News RSS        AI statement reader       AI insight cache        Risk, Markowitz, stress    advice guardrails        Copilot chat
```

**Price data.** Shares and ETFs are valued at official NSE closing prices (bhavcopy) and mutual funds at AMFI NAVs. Two years of daily history are rebuilt from NSE's archive by `scripts/backfill-nse-history.mts`. NSE does not adjust previous closes for bonuses or splits, so one-day moves beyond 25% that match a standard ratio (1:2, 1:5, 1:10 …) are detected and removed. Gold bonds use an international-gold × USD/INR estimate of the IBJA rate.

The `/methodology` page documents every data source (with live freshness), every formula, how the AI is grounded, security, and known limitations.

---

# 🧪 Quality

The `/evaluation` page runs three reproducible benchmarks on the live system:

- **AI Copilot**: 26 questions across portfolio, health, goals, risk, tax, calculations and guardrails. Expected figures come from calling the same tools the Copilot uses, so the benchmark measures whether answers faithfully report computed numbers; it also checks tool selection, refusals and latency.
- **Statement Reader**: six synthetic documents (CAS PDF, broker CSV, MF statement with transactions, broker report, informal email, and a non-statement) with known answers, scored field by field (name, ISIN, quantity, average cost, total cost).
- **Optimiser backtest**: a five-year walk-forward test with monthly rebalancing, a one-year training window, 0.1% trading costs and no look-ahead, comparing the max-Sharpe and minimum-variance optimisers with the current mix, equal weight and the Nifty 50.

Every table can be copied as Markdown for reports.

- Unit tests check each engine against closed-form results: tangency and minimum-variance portfolios, exact factor betas from synthetic data, Ledoit–Wolf properties, drawdown and VaR, XIRR, Monte Carlo, corporate-action cleaning and statement matching.
- `npm test` runs the suite; `npx tsc --noEmit` and `npm run lint` keep types and style clean.
- GitHub Actions runs the type check, lint, unit tests and a production build without secrets on every push and pull request.
- An accessibility audit of every page (accessible names, form labels, heading order) is clean.

---

# 🎯 Project Philosophy

OmniScope follows one simple belief.

> People don't need more financial information.

> People need better financial outcomes.

Every screen should answer

- What happened?
- Why?
- What next?
- What should I learn?

---

# 🎨 Design Principles

- Calm
- Premium
- Minimal
- Educational
- AI First
- Invisible Complexity

---

# 🛣️ Roadmap

## ✅ Built

- Dashboard with Today's Financial Story, Portfolio, X-Ray, Financial Health, Goals, Learning Hub, Wealth DNA, Wealth Journey, Future Self, Market Intelligence
- Supabase authentication and PostgreSQL backend
- Verified NSE and AMFI pricing with two-year history
- AI Copilot with tool calling, AI Statement Reader, AI market analyst
- Risk Lab: risk metrics, Markowitz optimiser, crash tests
- Tax Centre: capital-gains estimates, gain and loss harvesting
- Public landing page and methodology page, command palette

## 🚧 Next

- Lot-level (FIFO) tracking from transaction history for exact holding periods
- Account Aggregator and broker integrations
- Price alerts and weekly email reports

---

# 🌏 Future Vision

Support for

- Stocks
- Mutual Funds
- ETFs
- REITs
- InvITs
- Bonds
- Sovereign Gold Bonds
- Gold
- Fixed Deposits
- PPF
- EPF
- NPS
- International Investments

Everything.

One platform.

---

# 🤝 Contributing

We welcome contributions that improve:

- User Experience
- Financial Education
- Portfolio Intelligence
- AI Experiences
- Accessibility
- Performance

---

# 📄 License

MIT License

---

<div align="center">

## ⭐ If you like this project, consider giving it a star.

### Built with ❤️ for Securities Market TechSprint @ GFF 2026

**OmniScope**
### *Institutional-grade Wealth Intelligence for Everyone.*

</div>
