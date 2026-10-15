import { defineEval, matches } from '@databricks/appkit/beta';

export default defineEval({
  description: 'A follow-up comparison retains context and uses deterministic calculation',
  async test(t) {
    await t.send('Show me three 2+ bedroom homes under $900K near transit with outdoor space.');
    t.succeeded();
    await t.send('Which one offers the best value per square foot? Prefer quieter neighborhoods.');
    t.succeeded();
    t.calledTool('compare_listings');
    t.check(t.reply, matches(/\[RE-[A-Z0-9-]+\]/i));
    t.check(t.reply, matches(/quiet|noise|not available|dataset/i));
  },
});
