export default function handler(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    modelConfigured: process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-6'
  });
}
