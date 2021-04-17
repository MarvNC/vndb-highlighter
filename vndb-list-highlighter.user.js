// ==UserScript==
// @name        VNDB List Highlighter
// @namespace   https://github.com/MarvNC
// @match       https://vndb.org/s*
// @match       https://vndb.org/p*
// @match       https://vndb.org/v*
// @match       https://vndb.org/u*/edit
// @version     1.24
// @author      Marv
// @downloadURL https://raw.githubusercontent.com/MarvNC/vndb-list-highlighter/main/vndb-list-highlighter.user.js
// @updateURL   https://raw.githubusercontent.com/MarvNC/vndb-list-highlighter/main/vndb-list-highlighter.user.js
// @description Highlights entries on VNDB that are on a logged in user's vn list.
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_addStyle
// @grant       GM_getResourceText
// @require     https://unpkg.com/@popperjs/core@2.9.2/dist/umd/popper.min.js
// @run-at      document-idle
// ==/UserScript==

const delayMs = 200;
const fetchListMs = 600000;
const updatePageMs = 2592000000;
const listExportUrl = (id) => `https://vndb.org/${id}/list-export/xml`;
const types = {
  VN: 'loli',
  Settings: 'cute',
  Staff: {
    vnSelector: 'tr > td.tc1 > a',
    insertBefore: '#maincontent > .boxtitle',
    box: (novels, count) => `<div class="mainbox browse staffroles">
  <p>On List (${count})</p>
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
  CompanyVNs: {
    vnSelector: '#maincontent > div.mainbox > ul > li > a',
    insertBefore: '#maincontent > div:nth-child(3)',
    box: (novels, count) => `<div class="mainbox">
    <p>On List (${count})</p>
    <ul class="prodvns">
      ${novels}
    </ul>
  </div>
  `,
  },
  Releases: {
    vnSelector: 'tbody > tr.vn > td > a',
    insertBefore: '#maincontent > div:nth-child(3)',
    box: (novels) => `<div class="mainbox">
    <p>On List (${count})</p>
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

let colors = GM_getValue('colors', {
  highlightColor: 'rgba(190, 33, 210, 0.18)',
  subTextColor: '#37a',
});

GM_addStyle(
  `.listinfo{color:${colors.subTextColor}!important;padding-left:15px;}
  .colorbg{background:${colors.highlightColor}!important}
  .tooltip{display:none;z-index:999;}.tooltip[data-show]{display:block;}`
);

let vns;
if (!GM_getValue('pages', null)) GM_setValue('pages', {});

(async function () {
  await updateUserList();

  let type = getType(document.URL, document);

  if (type == types.VN) {
    let pages = [...document.querySelectorAll('a[href]')].filter((elem) =>
      elem.href.match(/vndb.org\/[sp]\d+/)
    );
    for (let pageElem of pages) {
      console.log(`Fetching page: ${pageElem.innerHTML} - ${pageElem.href}`);
      let pageInfo = await getPage(pageElem.href);
      let tooltip;
      if (pageInfo.count != 0) {
        tooltip = createElementFromHTML(pageInfo.table);
      } else {
        tooltip = createElementFromHTML(`<div class="mainbox">
        <p>No Novels on List</p>
      </div>`);
      }
      tooltip.className += ' tooltip';
      pageElem.prepend(tooltip);
      let popperInstance = Popper.createPopper(pageElem, tooltip, {
        placement: 'top',
      });
      function show() {
        tooltip.setAttribute('data-show', '');
        popperInstance.update();
      }
      function hide() {
        tooltip.removeAttribute('data-show');
      }
      const showEvents = ['mouseenter', 'focus'];
      const hideEvents = ['mouseleave', 'blur'];
      showEvents.forEach((event) => {
        pageElem.addEventListener(event, show);
      });
      hideEvents.forEach((event) => {
        pageElem.addEventListener(event, hide);
      });
    }
  } else if ([types.CompanyVNs, types.Releases, types.Staff].includes(type)) {
    let page = await getPage(document.URL, document);
    let table = createElementFromHTML(page.table);
    page.before.parentElement.insertBefore(table, page.before);
    if (type == types.Staff) {
      table.parentElement.insertBefore(createElementFromHTML(), table);
    }
  } else if (type == types.Settings) {
  }
})();

async function getPage(url, doc = null) {
  let type,
    table,
    before,
    count = 0;

  if (!doc) {
    if (url.match('vndb.org/p')) url = 'https://vndb.org/' + url.match(/p\d+/)[0] + '/vn';

    if (
      GM_getValue('pages', null)[url] &&
      GM_getValue('pages', null)[url].lastUpdate + updatePageMs > new Date().valueOf()
    ) {
      return GM_getValue('pages', null)[url];
    }

    doc = document.createElement('html');

    let responseText,
      waitMs = delayMs,
      success = false;
    while (!success) {
      await fetch(url).then(async (response) => {
        responseText = await response.text();
        success = response.ok;
        if (!response.ok) {
          waitMs *= 2;
          console.log('Failed response, new wait:' + waitMs);
        }
      });
      await timer(waitMs);
    }
    doc.innerHTML = responseText;

    type = getType(url, doc);
  }

  type = getType(url, doc);
  vns = GM_getValue('vns', null);

  let vnElems = [...doc.querySelectorAll(type.vnSelector)];
  let novelelements = '';
  vnElems.forEach((elem) => {
    let vnID = elem.href.split('/').pop();
    if (vns[vnID] && vns[vnID].lists.length > 0) {
      let bgElem = type == types.Staff ? elem.parentElement.parentElement : elem.parentElement;
      bgElem.className += 'colorbg';
      elem.innerHTML = `
<strong>
  ${elem.innerHTML}
</strong>
<span class="listinfo">
  ${vns[vnID].lists.join(', ') + (vns[vnID].vote ? ' ; Score: ' + vns[vnID].vote : '')}
</span>`;

      if (type == types.CompanyVNs) {
        novelelements += '<li>' + elem.parentElement.innerHTML + '</li>';
      } else {
        novelelements += '<tr>' + elem.parentElement.parentElement.innerHTML + '</tr>';
      }
      count++;
    }
  });

  table = type.box(novelelements, count);
  before = doc.querySelector(type.insertBefore);

  let pages = GM_getValue('pages');
  pages[url] = { count, lastUpdate: new Date().valueOf(), table };
  GM_setValue('pages', pages);
  return { type, table, before, count };
}

function getType(url, doc) {
  if (url.match('vndb.org/s')) return types.Staff;
  else if (url.match('vndb.org/p')) {
    let text = doc.querySelector('#maincontent > div:nth-child(3) > ul > li.tabselected > a')
      .innerText;
    return text == 'Releases' ? types.Releases : types.CompanyVNs;
  } else if (url.match('vndb.org/v')) {
    return types.VN;
  } else if (url.match(/vndb.org\/u\d+\/edit/)) {
    return types.Settings;
  }
}

async function updateUserList() {
  console.log('Last List Fetch: ' + new Date(GM_getValue('lastFetch')));
  if (GM_getValue('lastFetch', 0) + fetchListMs < new Date().valueOf()) {
    GM_setValue('lastFetch', new Date().valueOf());
    let response = await fetch(listExportUrl(userID)).then((response) => response.text());
    let parser = new DOMParser();
    let xmlDoc = parser.parseFromString(response, 'text/xml');
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
}

function createElementFromHTML(htmlString) {
  var div = document.createElement('div');
  div.innerHTML = htmlString.trim();

  return div.firstChild;
}

function timer(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
