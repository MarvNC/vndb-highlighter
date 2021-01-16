// ==UserScript==
// @name        VNDB List Highlighter
// @namespace   https://github.com/MarvNC
// @match       https://vndb.org/s*
// @match       https://vndb.org/p*
// @grant       none
// @version     1.0
// @author      -
// @description Highlights entries on VNDB that are on a logged in user's vn list.
// ==/UserScript==

const listExportUrl = (id) => `https://vndb.org/${id}/list-export/xml`;
const highlightColor = '#2B0A27';
const types = {
  STAFF: 1,
  VNS: 2,
  RELEASES: 3,
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

(async function () {
  let response = await fetch(listExportUrl(userID)).then((response) => response.text());
  let parser = new DOMParser();
  xmlDoc = parser.parseFromString(response, 'text/xml');
  let vnsList = xmlDoc.querySelectorAll('vndb-export > vns > vn');
  let vns = {};
  Array.from(vnsList).forEach((vn) => {
    vns[vn.id] = {};
    vns[vn.id].title = vn.querySelector('title').innerHTML;
    vns[vn.id].lists = [...vn.querySelectorAll('label')].map(
      (label) => label.attributes.label.value
    );
    let vote = vn.querySelector('vote');
    vns[vn.id].vote = vote ? parseFloat(vote.innerHTML) : 0;
  });
  console.log(vns);

  let vnElems;

  if (page == types.STAFF) vnElems = [...document.querySelectorAll('tr > td.tc1 > a')];
  /* .map((a) => a.parentNode); */ else if (page == types.VNS)
    vnElems = [...document.querySelectorAll('#maincontent > div.mainbox > ul > li > a')];
  else if (page == types.RELEASES)
    vnElems = [...document.querySelectorAll('tbody > tr.vn > td > a')];

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
      // elem.innerHTML =
    }
  });
})();
