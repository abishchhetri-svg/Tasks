/**
 * Claude API Client
 * Simple wrapper for Claude API calls
 */

const https = require('https');

class ClaudeClient {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }
  }

  async analyze(data) {
    const prompt = this.buildAnalysisPrompt(data);

    const response = await this.callClaude(prompt);
    return response;
  }

  buildAnalysisPrompt(data) {
    const { activityWatch, gitActivity, summary, manualTasks, date } = data;

    return `You are a work activity analyzer. Analyze the following data and generate a structured daily work log.

## Date
${date}

## Activity Summary
- Active Hours: ${summary?.activeHours || 0}
- AFK Hours: ${summary?.afkHours || 0}
- Total Git Commits: ${gitActivity?.totalCommits || 0}

## Top Applications Used
${Object.entries(summary?.topApps || {})
  .map(([app, duration]) => `- ${app}: ${Math.round(duration / 60)} minutes`)
  .join('\n')}

## Top Websites Visited
${Object.entries(summary?.topWebsites || {})
  .map(([site, duration]) => `- ${site}: ${Math.round(duration / 60)} minutes`)
  .slice(0, 5)
  .join('\n')}

## Git Commits Today
${gitActivity?.commits?.map(c => `- [${c.project}] ${c.message}`).join('\n') || 'No commits today'}

## Manual Tasks Added by User
${manualTasks?.map(t => `- ${t}`).join('\n') || 'No manual tasks added'}

## Instructions
Analyze the above data and categorize the work. Generate a JSON response with the following structure:

{
  "hours_active": number (total active hours),
  "hours_coding": number (estimated coding hours based on apps used),
  "hours_meetings": number (if any meeting apps detected),
  "hours_research": number (browsing/documentation time),
  "commits_today": number,
  "projects": ["list of projects worked on"],
  "tags": ["relevant tags like: coding, debugging, research, meetings, etc"],
  "activity_summary": {
    "time_distribution": "brief description of how time was spent",
    "focus_areas": ["main focus areas"]
  },
  "completed_tasks": ["tasks that appear completed based on commits/activity"],
  "in_progress": ["work that seems to be in progress"],
  "research_learning": ["any research or learning activities detected"],
  "blockers": ["any potential blockers noticed"],
  "ai_insights": ["interesting observations about the day's work"],
  "tomorrow_plan": ["suggested priorities for tomorrow"]
}

IMPORTANT: Return ONLY valid JSON, no markdown formatting or explanation.`;
  }

  async callClaude(prompt) {
    const requestBody = JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'api.anthropic.com',
          port: 443,
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Length': Buffer.byteLength(requestBody)
          }
        },
        (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const response = JSON.parse(data);

              if (response.error) {
                reject(new Error(`Claude API Error: ${response.error.message}`));
                return;
              }

              const content = response.content?.[0]?.text || '';

              // Try to parse JSON from response
              try {
                // Remove potential markdown code blocks
                const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim();
                const parsed = JSON.parse(jsonStr);
                resolve(parsed);
              } catch (parseErr) {
                // If parsing fails, return raw content
                resolve({ raw: content, parseError: parseErr.message });
              }
            } catch (err) {
              reject(err);
            }
          });
        }
      );

      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });
  }
}

module.exports = { ClaudeClient };
