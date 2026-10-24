// Builds .local/pack.json from the synced snapshot, timetable and reviewed records.
import {buildPack} from '../src/buildPack.ts';
import {loadReviewed} from '../src/review.ts';
// @ts-expect-error plain ESM helper without type declarations
import {readJson,writeJsonAtomic,local} from '../lib/store.mjs';

const snapshot=readJson(local('snapshot.json'));
if(!snapshot)throw new Error('Run npm run sync first.');
const timetable=readJson(local('timetable.json'));
const reviewed=loadReviewed(snapshot);
const pack=buildPack({snapshot,timetable,reviewed:reviewed.records});
writeJsonAtomic(local('pack.json'),pack);
console.log(JSON.stringify({updatedAt:pack.updatedAt,courses:pack.courses.length,records:pack.records.length,meetings:pack.meetings.length,
  submitted:pack.submitted.length,reviewedRecords:reviewed.records.length,rejectedReviewFiles:reviewed.rejected}));
