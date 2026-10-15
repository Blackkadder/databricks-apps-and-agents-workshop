import { defineEval, matches } from '@databricks/appkit/beta';

export default defineEval({
  description: 'Scripted discovery is grounded in search and cites stable listing IDs',
  async test(t) {
    await t.send(
      'Show me three 2+ bedroom homes under $900K near transit with outdoor space, and explain the tradeoffs.'
    );
    t.succeeded();
    t.calledTool('search_listings');
    t.check(t.reply, matches(/\[RE-[A-Z0-9-]+\]/i));
  },
});
