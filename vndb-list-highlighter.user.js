// ==UserScript==
// @name        VNDB List Highlighter
// @namespace   https://github.com/MarvNC
// @match       https://vndb.org/s*
// @match       https://vndb.org/p*
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_addStyle
// @version     1.1
// @author      Marv
// @downloadURL https://raw.githubusercontent.com/MarvNC/vndb-list-highlighter/main/vndb-list-highlighter.user.js
// @updateURL   https://raw.githubusercontent.com/MarvNC/vndb-list-highlighter/main/vndb-list-highlighter.user.js
// @description Highlights entries on VNDB that are on a logged in user's vn list.
// ==/UserScript==

// 10 minute wait
const fetchWait = 600000;
const listExportUrl = (id) => `https://vndb.org/${id}/list-export/xml`;
const highlightColor = {
  main: 'rgba(190, 33, 210, 0.18)',
  finished: 'rgba(190, 33, 210, 0.18)',
};
const types = {
  STAFF: {
    vnSelector: 'tr > td.tc1 > a',
    insertBefore: '#maincontent > .boxtitle',
    box: (novels) => `<div class="mainbox browse staffroles">
  <table class="stripe">
    <thead>
      <tr>
        <td class="tc1">Title</td>
        <td class="tc2">Released</td>
        <td class="tc3">Role/Cast</td>
        <td class="tc4">As</td>
        <td class="tc5">Note</td>
      </tr>
    </thead>
    <tbody>
      ${novels}
    </tbody>
  </table>
</div>`,
  },
  VNS: {
    vnSelector: '#maincontent > div.mainbox > ul > li > a',
    insertBefore: '#maincontent > div:nth-child(3)',
    box: (novels) => `<div class="mainbox">
    <h1>On List</h1>
    <ul class="prodvns">
      ${novels}
    </ul>
  </div>
  `,
  },
  RELEASES: {
    vnSelector: 'tbody > tr.vn > td > a',
    insertBefore: '#maincontent > div:nth-child(3)',
    box: (novels) => `<div class="mainbox">
    <h1>Releases</h1>
    <table class="releases">
      <tbody>
        ${novels}
      </tbody>
    </table>
  </div>
  `,
  },
};

let userIDelem = document.querySelector('#menulist > div:nth-child(3) > div > a:nth-child(1)');
let userID = userIDelem ? userIDelem.href.match(/u\d+/)[0] : null;

let page;
if (document.URL.match('vndb.org/s')) page = types.STAFF;
else if (document.URL.match('vndb.org/p')) {
  page = document.URL.match(/vn$/) ? types.VNS : types.RELEASES;
}

console.log(page);

(async function () {
  // set colors
  let colors = GM_getValue('colors', {
    highlightColor: 'rgba(190, 33, 210, 0.18)',
    subTextColor: '#37a',
  });
  GM_addStyle(`.listinfo{color:${colors.subTextColor} !important;padding-left:15px;}`);

  // get user list
  console.log('Last List Fetch: ' + new Date(GM_getValue('lastFetch')));
  if (GM_getValue('lastFetch', 0) + fetchWait < new Date().valueOf()) {
    GM_setValue('lastFetch', new Date().valueOf());
    let response = await fetch(listExportUrl(userID)).then((response) => response.text());
    let parser = new DOMParser();
    xmlDoc = parser.parseFromString(response, 'text/xml');
    let vnsList = [...xmlDoc.querySelectorAll('vndb-export > vns > vn')];
    let vns = {};
    vnsList.forEach((vn) => {
      vns[vn.id] = {};
      vns[vn.id].title = vn.querySelector('title').innerHTML;
      vns[vn.id].lists = [...vn.querySelectorAll('label')].map(
        (label) => label.attributes.label.value
      );
      let vote = vn.querySelector('vote');
      vns[vn.id].vote = vote ? parseFloat(vote.innerHTML) : 0;
    });
    GM_setValue('vns', vns);
  }

  let vns = GM_getValue('vns', null);

  // go through links on page that are vns
  let vnElems = [...document.querySelectorAll(page.vnSelector)];
  let novelelements = '';
  vnElems.forEach((elem) => {
    let vnID = elem.href.split('/').pop();
    if (vns[vnID] && vns[vnID].lists.length > 0) {
      console.log(vns[vnID]);
      let bgElem = page == types.STAFF ? elem.parentElement.parentElement : elem.parentElement;
      bgElem.style.background = colors.highlightColor;
      elem.innerHTML = `
<strong>
  ${elem.innerHTML}
</strong>
<span class="listinfo">
  ${vns[vnID].lists.join(', ') + (vns[vnID].vote ? ' ; Score: ' + vns[vnID].vote : '')}
</span>`;

      if (page == types.VNS) {
        novelelements += '<li>' + elem.parentElement.innerHTML + '</li>';
      } else {
        novelelements += '<tr>' + elem.parentElement.parentElement.innerHTML + '</tr>';
      }
    }
  });

  console.log(novelelements);
  let table = createElementFromHTML(page.box(novelelements));
  let before = document.querySelector(page.insertBefore);
  before.parentElement.insertBefore(table, before);
  if (page == types.STAFF) {
    table.parentElement.insertBefore(
      createElementFromHTML(`<h1 class="boxtitle">On List</h1>`),
      table
    );
  }
})();

function createElementFromHTML(htmlString) {
  var div = document.createElement('div');
  div.innerHTML = htmlString.trim();

  // Change this to div.childNodes to support multiple top-level nodes
  return div.firstChild;
}
