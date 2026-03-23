# AI Moderation POC - Content Moderation

A proof-of-concept content moderation system that analyzes **text** and **images** and returns a single decision (approved / under review / rejected) with explanations.

## Features

- **Text moderation** — OpenAI (GPT) evaluates text and returns severity, confidence, categories, and an explanation.
- **Image moderation** — AWS Rekognition detects unsafe content; images over 5 MB are automatically resized before sending.
- **Combined decision** — A small decision engine merges text and image results (max risk wins) and produces a final verdict and explanation.
- **Web UI** — Simple form to submit text and/or image, with risk score, explanations, uploaded image preview, and raw JSON response.

## Tech stack

- **Backend:** Node.js, Express, Multer
- **Text:** OpenAI API (chat completions, JSON output) - Text Moderation
- **Images:** AWS Rekognition (DetectModerationLabels), Sharp (resize when > 5 MB) - Lambda - SQS and Rekognition - Image Moderation
- **Frontend:** Vanilla HTML/CSS/JS

## Setup

1. Clone the repo and install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root with:

   ```
   OPENAI_API_KEY=your_openai_api_key
   AWS_ACCESS_KEY_ID=your_aws_access_key
   AWS_SECRET_ACCESS_KEY=your_aws_secret_key
   AWS_REGION=your_region
   ```

3. Start the server:

   ```bash
   node server.js
   ```

4. Open [http://localhost:3000](http://localhost:3000) and use the form to submit text and/or an image.

## Project structure

- `server.js` — Express app, moderation endpoint, OpenAI and Rekognition integration, image size handling
- `decisionEngine.js` — Combines text and image risk into a single decision and explanation
- `public/index.html` — Moderation form and results UI

## License

ISC
