// ==UserScript==
// @name        VNDB List Highlighter
// @namespace   https://github.com/MarvNC
// @match       https://vndb.org/s*
// @match       https://vndb.org/p*
// @match       https://vndb.org/v*
// @match       https://vndb.org/u*/edit
// @version     1.3
// @author      Marv
// @downloadURL https://raw.githubusercontent.com/MarvNC/vndb-list-highlighter/main/vndb-list-highlighter.user.js
// @updateURL   https://raw.githubusercontent.com/MarvNC/vndb-list-highlighter/main/vndb-list-highlighter.user.js
// @description Highlights entries on VNDB that are on a logged in user's vn list.
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_addStyle
// @grant       GM_getResourceText
// @require     https://unpkg.com/@popperjs/core@2.9.2/dist/umd/popper.min.js
// @require     https://cdn.jsdelivr.net/npm/@simonwep/pickr/dist/pickr.min.js
// @resource    pickrCSS https://cdn.jsdelivr.net/npm/@simonwep/pickr/dist/themes/classic.min.css
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
const defaultColors = {
  highlightColor: 'rgba(190, 33, 210, 0.18)',
  subTextColor: '#1D73B0',
};

let userIDelem = document.querySelector('#menulist > div:nth-child(3) > div > a:nth-child(1)');
let userID = userIDelem ? userIDelem.href.match(/u\d+/)[0] : null;

let colors = GM_getValue('colors', defaultColors);

GM_addStyle(
  `.listinfo{color:${colors.subTextColor}!important;padding-left:15px;}
  .colorbg{background:${colors.highlightColor}!important}
  .tooltip{display:none;z-index:999;}.tooltip[data-show]{display:block;}`
);
GM_addStyle(GM_getResourceText('pickrCSS'));

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
  } else if (type == types.Settings) {
    let fieldset = document.querySelector('#maincontent > form > fieldset');
    addPickerStuff(fieldset);

    let highlightPicker = Pickr.create(PickrOptions('.color-picker-1', colors.highlightColor));
    let subTextPicker = Pickr.create(PickrOptions('.color-picker-2', colors.subTextColor));
    let setColors = () => {
      highlightPicker.setColor(colors.highlightColor);
      subTextPicker.setColor(colors.subTextColor);
      updateColors();
    };
    document.querySelector('.saveColors').onclick = () => GM_setValue('colors', colors);
    document.querySelector('.resetColors').onclick = () => {
      colors = GM_getValue('colors', defaultColors);
      setColors();
    };
    document.querySelector('.resetDefaultColors').onclick = () => {
      colors = JSON.parse(JSON.stringify(defaultColors));
      setColors();
    };

    ['change', 'swatchselect', 'save'].forEach((colorEvent) =>
      highlightPicker.on(colorEvent, (color) => {
        colors.highlightColor = color.toRGBA().toString(2);
        updateColors();
      })
    );
    ['change', 'swatchselect', 'save'].forEach((colorEvent) =>
      subTextPicker.on(colorEvent, (color) => {
        colors.subTextColor = color.toRGBA().toString(2);
        updateColors();
      })
    );

    function updateColors() {
      [...document.querySelectorAll('.colorbg')].forEach((elem) => {
        elem.style.cssText = `background:${colors.highlightColor}!important`;
      });
      [...document.querySelectorAll('.listinfo')].forEach((elem) => {
        elem.style.cssText = `color:${colors.subTextColor}!important`;
      });
    }
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

function PickrOptions(selector, defaultColor) {
  return {
    el: selector,
    theme: 'classic',

    default: defaultColor,

    swatches: [
      'rgba(244, 67, 54, 1)',
      'rgba(233, 30, 99, 0.95)',
      'rgba(156, 39, 176, 0.9)',
      'rgba(103, 58, 183, 0.85)',
      'rgba(63, 81, 181, 0.8)',
      'rgba(33, 150, 243, 0.75)',
      'rgba(3, 169, 244, 0.7)',
      'rgba(0, 188, 212, 0.7)',
      'rgba(0, 150, 136, 0.75)',
      'rgba(76, 175, 80, 0.8)',
      'rgba(139, 195, 74, 0.85)',
      'rgba(205, 220, 57, 0.9)',
      'rgba(255, 235, 59, 0.95)',
      'rgba(255, 193, 7, 1)',
    ],

    components: {
      // Main components
      preview: true,
      opacity: true,
      hue: true,

      // Input / output Options
      interaction: {
        hex: true,
        rgba: true,
        hsla: true,
        hsva: true,
        cmyk: true,
        input: true,
        clear: true,
        save: true,
      },
    },
  };
}

function addPickerStuff(fieldset){
  fieldset.append(
    createElementFromHTML(`<div class="mainbox">
    <h1>List Highlighter</h1>
    <table class="formtable">
      <tr class="newpart">
        <td colspan="2">Pick Colors</td>
      </tr>
      <tr class="newfield">
        <td class="label">Entry Color</td>
        <td class="field"><div class="color-picker-1"></div></td>
      </tr>
      <tr class="newfield">
        <td class="label">List Test Color</td>
        <td class="field"><div class="color-picker-2"></div></td>
      </tr>
    </table>
      <div class="colorbuttons">
        <input type="button" value="Save" class="submit saveColors">
        <input type="button" value="Reset" class="submit resetColors">
        <input type="button" value="Reset to Defaults" class="submit resetDefaultColors">
      </div>
  </div>
  `)
  );
  fieldset.append(
    createElementFromHTML(`<div class="mainbox browse staffroles">
    <p>On List (10)</p>
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
        <tr>
          <td class="tc1">
            <a href="/v11856" title="フレラバ ～Friend to Lover～"> Fureraba ~Friend to Lover~ </a>
          </td>
          <td class="tc2">2013-06-28</td>
          <td class="tc3"><a href="/c16555" title="望月 理奈">Mochizuki Rina</a></td>
          <td class="tc4" title="あじ秋刀魚">Aji Sanma</td>
          <td class="tc5"></td>
        </tr>
        <tr>
          <td class="tc1">
            <a href="/v14265" title="星織ユメミライ">
               Hoshi Ori Yume Mirai </a
            >
          </td>
          <td class="tc2">2014-07-25</td>
          <td class="tc3"><a href="/c19045" title="篠崎 真里花">Shinozaki Marika</a></td>
          <td class="tc4" title="あじ秋刀魚">Aji Sanma</td>
          <td class="tc5"></td>
        </tr>
        <tr class="colorbg">
          <td class="tc1">
            <a href="/v15077" title="あの晴れわたる空より高く">
              <strong> Ano Harewataru Sora yori Takaku </strong>
              <span class="listinfo"> Finished, Voted ; Score: 10 </span></a
            >
          </td>
          <td class="tc2">2014-09-26</td>
          <td class="tc3"><a href="/c21325" title="黎明 夏帆">Reimei Kaho</a></td>
          <td class="tc4" title="あじ秋刀魚">Aji Sanma</td>
          <td class="tc5"></td>
        </tr>
        <tr>
          <td class="tc1">
            <a href="/v15064" title="ゆきこいめると">
              Yuki Koi Melt </a
            >
          </td>
          <td class="tc2">2015-03-27</td>
          <td class="tc3"><a href="/c24603" title="烈風寺 嘩音">Reppuuji Kanon</a></td>
          <td class="tc4" title="あじ秋刀魚">Aji Sanma</td>
          <td class="tc5"></td>
        </tr>
        <tr>
          <td class="tc1">
            <a href="/v18131" title="まいてつ">
               Maitetsu </a
            >
          </td>
          <td class="tc2">2016-03-25</td>
          <td class="tc3"><a href="/c39201" title="雛衣 ポーレット">Hinai Paulette</a></td>
          <td class="tc4" title="あじ秋刀魚">Aji Sanma</td>
          <td class="tc5"></td>
        </tr>
        <tr>
          <td class="tc1">
            <a href="/v20433" title="猫忍えくすはーと">
               Neko-nin exHeart </a
            >
          </td>
          <td class="tc2">2017-02-24</td>
          <td class="tc3"><a href="/c55101" title="風魔 たま">Fuuma Tama</a></td>
          <td class="tc4" title="あじ秋刀魚">Aji Sanma</td>
          <td class="tc5"></td>
        </tr>
        <tr class="colorbg">
          <td class="tc1">
            <a href="/v21852" title="金色ラブリッチェ">
              <strong> Kin'iro Loveriche </strong>
              <span class="listinfo"> Playing </span></a
            >
          </td>
          <td class="tc2">2017-12-22</td>
          <td class="tc3">
            <a href="/c64304" title="エロイナ・ディ・カバリェロ・イスタ"
              >Heroina di Caballero istaa</a
            >
          </td>
          <td class="tc4" title="あじ秋刀魚">Aji Sanma</td>
          <td class="tc5"></td>
        </tr>
        <tr>
          <td class="tc1">
            <a href="/v26000" title="きまぐれテンプテーション">
               Kimagure Temptation </a
            >
          </td>
          <td class="tc2">2019-09-27</td>
          <td class="tc3"><a href="/c83876" title="クーリィ">Cooley</a></td>
          <td class="tc4" title="あじ秋刀魚">Aji Sanma</td>
          <td class="tc5"></td>
        </tr>
        <tr>
          <td class="tc1">
            <a href="/v24689" title="スタディ§ステディ">
               Study § Steady </a
            >
          </td>
          <td class="tc2">2019-09-27</td>
          <td class="tc3"><a href="/c77386" title="来宮 なのか">Kinomiya Nanoka</a></td>
          <td class="tc4" title="あじ秋刀魚">Aji Sanma</td>
          <td class="tc5"></td>
        </tr>
        <tr class="colorbg">
          <td class="tc1">
            <a href="/v27449" title="ハミダシクリエイティブ">
              <strong> Hamidashi Creative </strong>
              <span class="listinfo"> Wishlist, Wishlist-Medium </span></a
            >
          </td>
          <td class="tc2">2020-09-25</td>
          <td class="tc3"><a href="/c91567" title="和泉 里">Izumi Miri</a></td>
          <td class="tc4" title="あじ秋刀魚">Aji Sanma</td>
          <td class="tc5"></td>
        </tr>
      </tbody>
    </table>
  </div>
  `)
  );
}