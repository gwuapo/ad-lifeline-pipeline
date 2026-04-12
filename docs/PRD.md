
Ad Lifeline System
Product Requirements Document
From Zero → Launch → Scale


1. Executive Summary
The Ad Lifeline System is an internal platform that takes any product from idea to launch to scale while keeping the business extremely lean. The software handles deep market research, marketing asset generation, ad pipeline management, performance monitoring, iteration logic, and—most critically—learns from every ad run to compound intelligence over time.
The end-state vision: spin up a new product (e.g., Toothpick X), and the system handles the entire pipeline from intelligence to collateral to ads to scaling, with feedback loops that compound.

1.1 Core Architectural Principle
Everything is scoped to a Product Workspace. Every research document, avatar, angle, script, creative asset, campaign, ad, comment export, metric snapshot, iteration, and learning must attach to a single product workspace. This strict scoping is non-negotiable—the entire system’s reliability depends on it.

2. System Modules Overview


3. Module 1: Product Intelligence (Product Library)
This module handles product workspace creation and deep market research. It is the foundational data layer that feeds every other module.

3.1 Product Workspace Creation
When creating a new product workspace, the system collects the following variables from the user:



3.2 Research Pipeline
Research must be conducted in strict sequential order because each step builds on outputs from previous steps. The system saves documents from each stage and feeds them into the next.

3.2.1 Research Steps (Sequential)
Product Market Awareness — Assess where the market sits on the awareness/sophistication spectrum.
Competitor Research — Map competitor positioning, claims, pricing, and channels.
Psychographic Deep Research (x3) — Run the same research prompt on three different AI models: Gemini, Claude Sonnet, and GPT-4o. This produces three independent perspectives.
Summarized Psychographic Research — Take the three documents from Step 3 and run a consolidation prompt to produce a unified summary.
Unified Deep Research Document — Final synthesis combining all previous outputs into the product’s permanent knowledge base.

3.2.2 AI Model Configuration
The system supports three AI models. Users can assign any model to any research step via the Settings page:



3.2.3 Custom Prompts
Users can configure the exact prompts used for each research step via a Settings page. This allows full customization of the research pipeline without code changes. Each step has a prompt template with access to previously generated research documents as context variables.

3.3 Knowledge Base Output
The research pipeline produces the product’s permanent knowledge base containing:
Avatars and their core desires
Objections and common confusions
Competitor positioning and claims
Unique mechanism options
Awareness and sophistication assessment
Winning angle hypotheses

This knowledge base becomes the “truth source” for all downstream modules.
4. Module 2: Marketing Collateral Factory
This module converts product intelligence into deployable marketing assets: campaigns, scripts, visuals, and landing pages.

4.1 Campaign Creation
Campaigns are created within a product workspace. Once a product is selected, the AI automatically inherits all research context so it can generate angles and scripts accurately. Each campaign tracks its own set of angles, scripts, creatives, and performance data.

4.2 Angle & Script Generator
The AI generates marketing angles and VSL/ad scripts using two inputs: the product research knowledge base and the swipe library (a curated collection of thousands of winning scripts). Scripts are generated as drafts and must be approved before entering production.

4.2.1 Functional Requirements
Generate multiple angle options ranked by predicted relevance
Each angle expands into a full script (VSL or short-form ad)
Scripts include: hook, lead, body, proof blocks, offer, CTA
Approval workflow: Draft → In Review → Approved → In Production
Version history for all scripts
Swipe library management: upload, tag, search, categorize winning scripts

4.3 Visual Generation
4.3.1 Video Generation
Connect to Sora via kie.ai routing layer. The system supports uploading 10–20 visual swipe examples per footage type so outputs stay consistent with brand style.



4.3.2 Image Generation
Separate image generation flow using Hicksfield and internal models. UI prompts the user for image purpose:
Image ad creative
Landing page hero image
Product mockup
Advertorial image

4.4 Landing Page Design Generation
Generate landing page designs and section compositions (image comps and specs) that can be implemented in Lovable funnels. Outputs include wireframes, copy blocks, and visual direction.
5. Module 3: Ad Lifeline Pipeline
This is the heart of the system. It tracks every ad from idea through production to live performance, and drives the iteration/scaling logic that makes the whole machine compound.

5.1 Pipeline Stages



5.2 Ad Record Data Model
Every ad in the pipeline carries a comprehensive record:
Ad name, type (VSL, UGC, Image Ad, Advertorial, Listicle)
Product workspace reference
Campaign reference
Assigned editor
Script and brief documents
Visual references and swipe examples
Revision history and comment threads
Performance metrics (CPA, conversions, spend, ROAS)
Scraped comments (including hidden negatives)
AI analysis reports
Iteration count and history
Learnings extracted from this ad

5.3 Collaboration Features
In-pipeline comment threads between founders and editors
File upload for drafts and revisions
Deadline tracking with overdue alerts
Revision request system with clear instructions

6. Module 4: Performance Engine

6.1 Automated Metrics Ingestion
Once an ad enters the Live stage, the system automatically pulls performance data from ad platforms (TikTok first) and logs it to the ad record.



6.2 CPA Threshold System
Users define CPA thresholds per product workspace. Each ad’s live CPA is automatically classified:



6.3 Comment Scraping
An automation agent (Manus API) performs the following:
Navigate to TikTok Ads Manager comment management
Filter and export comments by ad naming convention
Include comments that TikTok auto-hides (negative sentiment)
Upload scraped comments to the ad record
Comment scraping is mandatory—hidden negative comments contain the most valuable market intelligence.

6.4 Gemini Analysis Engine
For each ad in the Live stage, Gemini performs multi-modal analysis:
Visual analysis of the ad creative itself
Comment sentiment and topic analysis
Correlation with performance metrics

Gemini outputs actionable recommendations such as:
“People are confused about X — need a pre-lander/listicle to close open loops”
“Hook isn’t clear — test alternative opening”
“Proof element missing — add social proof or clinical data”
“Pacing issue — first 3 seconds need more tension”
Proposed next iteration plan with specific changes

6.5 Iteration vs Variation Logic

6.5.1 Losing Ads — Iteration Rules
Maximum 3 iterations per ad
Each iteration is informed by Gemini analysis (metrics + comments)
Iteration sends the ad back to Pre-Production with a new brief
If all 3 iterations fail, the ad is killed and learnings are logged

6.5.2 Winning Ads — Variation Rules
When an ad hits green CPA, the system triggers aggressive variation production:
Hook tests — same body, different opening hooks
Lead tests — different lead sections after the hook
Pre-lander vs Direct VSL tests
Listicle advertorial vs Quiz funnel vs PDP tests
Formatting and pacing tests
Different proof block arrangements
The goal is to systematically milk every winner through controlled split testing.
7. Module 5: Intelligence Flywheel
This is the most important compounding mechanism in the entire system. It creates a feedback loop where every ad run makes the system smarter.

7.1 Learning Capture
When an ad wins, the system logs:
Why it’s winning (hook type, angle, proof structure, pacing)
What patterns to replicate
Which objections and proof elements mattered
What visual/editing rhythm worked
Comment themes that indicate resonance

7.2 Learning Distribution
Captured learnings are pushed back into:
The product workspace knowledge base (enriching the truth source)
The VSL generator context (so new scripts inherit winning patterns)
The angle generation context (so new angles build on proven themes)

This means every future script and angle generated for that product is smarter because it incorporates real live market feedback from the Ad Lifeline. This feedback loop is the moat.

7.3 Learning Data Model

8. Module 6: User Access & Editor System

8.1 Role-Based Access



8.2 Editor Dashboard
When editors log in, they see only:
Task dashboard with assigned ads
Deadlines and overdue indicators
Brief documents and visual references
File upload for drafts
Revision requests and feedback
Comment thread to communicate with founders

8.3 Editor Incentive System

9. Technical Architecture

9.1 Integration Stack


9.2 Database Schema (Core Entities)

10. MVP Definition
The MVP includes the minimum feature set needed to run the full pipeline for one product. If we get this right, we can launch and scale products faster than anyone.



11. Key User Stories

11.1 Founder Stories
As a founder, I can create a new product workspace and run the full research pipeline so that I have a complete knowledge base before creating any ads.
As a founder, I can generate angles and scripts that are automatically informed by my product research and swipe library.
As a founder, I can track every ad through a visual pipeline from pre-production to live, seeing status at a glance.
As a founder, I can see live CPA performance with color-coded alerts so I know immediately which ads need attention.
As a founder, I can read AI analysis that combines visual review, comment sentiment, and metrics into actionable next steps.
As a founder, I can trigger iterations on losing ads (up to 3) and scale winning ads through systematic variations.
As a founder, I can see learnings from winning ads automatically enrich my product’s knowledge base for future campaigns.

11.2 Editor Stories
As an editor, I can see only the ads assigned to me with clear briefs, deadlines, and references.
As an editor, I can upload drafts and receive revision feedback in the same pipeline thread.
As an editor, I can see my performance dashboard including win rate, quality score, and bonuses earned.
12. Success Metrics



13. Risks & Mitigations



14. Next Steps
Review and finalize this PRD with all stakeholders
Set up database schema and core API endpoints
Build Module 1 (Product Intelligence) end-to-end
Build Module 3 (Ad Lifeline Pipeline) with the interactive Kanban UI
Integrate TikTok metrics ingestion and comment scraping
Connect Gemini analysis engine
Build the flywheel write-back mechanism
Add editor access controls and incentive dashboard
Launch internal beta with Darina as the first product workspace