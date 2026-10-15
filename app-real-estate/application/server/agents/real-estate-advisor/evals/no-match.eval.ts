import { defineEval, matches } from '@databricks/appkit/beta';

export default defineEval({
  description: 'No-match response clearly discloses that constraints were not silently relaxed',
  async test(t) {
    await t.send('Show me a five-bedroom home under $10.');
    t.succeeded();
    t.calledTool('search_listings');
    t.check(t.reply, matches(/no (listing|exact match)|not (find|found)|zero/i));
  },
});
