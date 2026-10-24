// Validates the agent's review files (.local/review/<documentId>.json) against the
// contract and the extracted page text. Prints per-file results, no course text.
import {loadReviewed,reviewQueue} from '../src/review.ts';
// @ts-expect-error plain ESM helper without type declarations
import {readJson,local} from '../lib/store.mjs';

const snapshot=readJson(local('snapshot.json'));
if(!snapshot)throw new Error('Run npm run sync first.');
const result=loadReviewed(snapshot),queue=reviewQueue(snapshot);
const byStatus=Object.groupBy(result.records,r=>r.review.status);
console.log(JSON.stringify({records:result.records.length,sourceBacked:byStatus['source-backed']?.length??0,needsReview:byStatus['needs-review']?.length??0,
  conflicts:byStatus.conflict?.length??0,quoteMismatches:result.unverified,rejected:result.rejected,stillQueued:queue.map(q=>q.documentId)},null,2));
if(result.rejected.length)process.exitCode=1;
