export default {
  id: 'public-smoke',
  title: 'Public page loads and primary CTA is clickable',
  tags: ['public', 'smoke'],
  risk: 'Catches broken SSR, missing public assets, console crashes, and dead primary CTAs.',
  async run({ page, baseUrl, expect, step, clickByText }) {
    await step('Open public page', async () => {
      const response = await page.goto(baseUrl, { waitUntil: 'networkidle2' });
      await expect.responseOk(response, 'Public page did not return a successful response');
      await expect.visibleText(/./);
    });

    await step('Click a visible public CTA if present', async () => {
      await clickByText(/get started|sign up|start|try|continue/i);
    });
  },
};
