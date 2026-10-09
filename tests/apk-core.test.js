import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { originalCore } from '../engine.js';
const reference=JSON.parse(fs.readFileSync(new URL('./fixtures/apk-1.2.88.json',import.meta.url)));
const canonical=matches=>matches.map(m=>[m.white,m.black].sort().join(':')).sort();
for(const c of reference.cases) test(`APK 1.2.88 oracle: ${c.name}`,()=>{
  const actual=originalCore(c.input);
  if(['ratings','tieBreaks','knockoutSlots','exportTrf','importTrf'].includes(c.input.operation))assert.deepEqual(actual,c.expected);
  else {
    // Flexible Swiss uses random colors when both preferences are equivalent.
    if(c.unorderedColors)assert.deepEqual(canonical(actual.matches),canonical(c.expected.matches));
    else assert.deepEqual(actual.matches,c.expected.matches);
    assert.equal(actual.bye,c.expected.bye);
    if(c.expected.order)assert.deepEqual(actual.order,c.expected.order);
  }
});
