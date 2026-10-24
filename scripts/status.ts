// One agent-readable summary of local state. Never prints tokens, keys or links.
import {existsSync} from 'node:fs';
// @ts-expect-error plain ESM helper without type declarations
import {readJson,local,hasToken} from '../lib/store.mjs';
const sync=readJson(local('last-sync.json')),tt=readJson(local('timetable.json')),queue=readJson(local('review-queue.json')),pack=readJson(local('pack.json')),gist=readJson(local('gist.json'));
console.log(JSON.stringify({
  setup:existsSync(local('..','.env.local')),token:hasToken()?'stored':'missing',tokenStatus:readJson(local('token-status.json'))?.status??null,
  lastSync:sync&&{status:sync.status,checkedAt:sync.checkedAt,courses:sync.courses,unavailable:sync.unavailable},
  timetable:tt&&{ay:tt.ay,semester:tt.semester,meetings:tt.meetings.length,exams:tt.exams.length,missing:tt.missing},
  reviewQueue:queue?.items?.length??null,pack:pack&&{updatedAt:pack.updatedAt,records:pack.records.length},
  published:gist?{updatedAt:gist.updatedAt}:null,pairingReady:existsSync(local('pairing-link.txt')),
},null,2));
