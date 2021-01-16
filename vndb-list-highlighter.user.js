// ==UserScript==
// @name        VNDB List Highlighter
// @namespace   https://github.com/MarvNC
// @match       https://vndb.org/s*
// @match       https://vndb.org/p*
// @grant       none
// @version     1.0
// @author      Marv
// @downloadURL https://raw.githubusercontent.com/MarvNC/vndb-list-highlighter/main/vndb-list-highlighter.user.js
// @updateURL   https://raw.githubusercontent.com/MarvNC/vndb-list-highlighter/main/vndb-list-highlighter.user.js
// @description Highlights entries on VNDB that are on a logged in user's vn list.
// ==/UserScript==

const listExportUrl = (id) => `https://vndb.org/${id}/list-export/xml`;
const highlightColor = '#2B0A27';
const types = {
  STAFF: { vnSelector: 'tr > td.tc1 > a' },
  VNS: { vnSelector: '#maincontent > div.mainbox > ul > li > a' },
  RELEASES: { vnSelector: 'tbody > tr.vn > td > a' },
};

let userIDelem = document.querySelector('#menulist > div:nth-child(3) > div > a:nth-child(1)');
let userID = userIDelem ? userIDelem.href.match(/u\d+/)[0] : null;

let page;
if (document.URL.match('vndb.org/s')) page = types.STAFF;
else if (document.URL.match('vndb.org/p')) {
  page =
    document.querySelector('#maincontent > div:nth-child(3) > ul > li.tabselected').innerText ==
    'Visual Novels'
      ? types.VNS
      : types.RELEASES;
}

let response = await fetch(listExportUrl(userID)).then((response) => response.text());
let parser = new DOMParser();
xmlDoc = parser.parseFromString(response, 'text/xml');
let vnsList = xmlDoc.querySelectorAll('vndb-export > vns > vn');
let vns = {};
Array.from(vnsList).forEach((vn) => {
  vns[vn.id] = {};
  vns[vn.id].title = vn.querySelector('title').innerHTML;
  vns[vn.id].lists = [...vn.querySelectorAll('label')].map((label) => label.attributes.label.value);
  let vote = vn.querySelector('vote');
  vns[vn.id].vote = vote ? parseFloat(vote.innerHTML) : 0;
});
console.log(vns);

let vnElems = [...document.querySelectorAll(page.vnSelector)];

vnElems.forEach((elem) => {
  let vnID = elem.href.split('/').pop();
  if (vns[vnID] && vns[vnID].lists.length > 0) {
    console.log(vns[vnID]);
    let bgElem = page == types.STAFF ? elem.parentElement.parentElement : elem.parentElement;
    bgElem.style.background = highlightColor;
    elem.innerHTML = `<strong>${
      elem.innerHTML
    }</strong><span style="color:#37a;padding-left:15px;">${vns[vnID].lists.join(', ')} ${
      vns[vnID].vote ? ` ; Score: ${vns[vnID].vote}` : ''
    }</span>`;
  }
});