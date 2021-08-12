// ==UserScript==
// @name        VNDB Highlighter
// @namespace   https://github.com/MarvNC
// @homepageURL https://github.com/MarvNC/vndb-highlighter
// @match       https://vndb.org/s*
// @match       https://vndb.org/p*
// @match       https://vndb.org/v*
// @match       https://vndb.org/c*
// @match       https://vndb.org/u*/edit
// @version     1.64
// @author      Marv
// @downloadURL https://raw.githubusercontent.com/MarvNC/vndb-highlighter/main/vndb-list-highlighter.user.js
// @updateURL   https://raw.githubusercontent.com/MarvNC/vndb-highlighter/main/vndb-list-highlighter.user.js
// @description Highlights and provides tooltips for known entries on VNDB.
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_addStyle
// @grant       GM_getResourceText
// @require     https://unpkg.com/@popperjs/core@2.9.2/dist/umd/popper.min.js
// @require     https://cdn.jsdelivr.net/npm/@simonwep/pickr/dist/pickr.min.js
// @resource    pickrCSS https://cdn.jsdelivr.net/npm/@simonwep/pickr/dist/themes/classic.min.css
// @run-at      document-idle
// ==/UserScript==

let delayMs = 300;
const fetchListMs = 600000;
const updatePageMs = 86400000;
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
        <td class="tc_ulist"></td>
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
  },
  CompanyOther: '🦀',
};
const defaultColors = {
  PlayingColor: 'rgba(168.72, 5.77, 189.48, 0.28)',
  FinishedColor: 'rgba(42.62, 210, 33, 0.25)',
  StalledColor: 'rgba(177.26, 191.93, 9.01, 0.24)',
  DroppedColor: 'rgba(210, 33, 33, 0.2)',
  WishlistColor: 'rgba(33, 210, 196.99, 0.26)',
  SubTextColor: 'rgba(29, 115, 176, 1)',
};
const statusTypes = {
  Playing: 1,
  Finished: 2,
  Stalled: 3,
  Dropped: 4,
  Wishlist: 5,
};

const addCSS = (colors) => /* css */ `
.listinfo{color:${colors.SubTextColor}!important;padding-left:15px;}
.tooltip{display:none;z-index:999;text-align:left;}
.tooltip[data-show]{display:block;}
.pickerdiv{position:absolute;}
.pcr-app{display:none!important;}
.pcr-app.visible{display:block!important;}`;

let userIDelem = document.querySelector('#menulist > div:nth-child(3) > div > a:nth-child(1)');
let userID = userIDelem ? userIDelem.href.match(/u\d+/)[0] : null;

let colors = GM_getValue('colors', duplicate(defaultColors));

GM_addStyle(addCSS(colors));
GM_addStyle(
  Object.keys(statusTypes)
    .map((listType) => `.colorbg.${listType}{background:${colors[listType + 'Color']}!important}`)
    .join('')
);
GM_addStyle(GM_getResourceText('pickrCSS'));

let vns;
if (!GM_getValue('pages', null)) GM_setValue('pages', {});

(async function () {
  await updateUserList();

  let type = getType(document.URL, document);

  if ([types.CompanyVNs, types.Releases, types.Staff].includes(type)) {
    getPage(document.URL, document, (info) => {
      let table = createElementFromHTML(info.table);
      let before = document.querySelector(type.insertBefore);
      before.parentElement.insertBefore(table, before);
    });
  } else if (type == types.Settings) {
    let fieldset = document.querySelector('#maincontent > form > fieldset');
    addPickerStuff(fieldset);

    let subTextPicker = Pickr.create(PickrOptions('.color-picker-0', colors.SubTextColor));
    let listPickers = Object.keys(statusTypes).map((key) => {
      let pickerColor = key + 'Color';
      return {
        picker: Pickr.create(
          PickrOptions('.color-picker-' + statusTypes[key], colors[pickerColor])
        ),
        color: pickerColor,
        listType: key,
      };
    });
    let allPickers = [...listPickers, { picker: subTextPicker, color: 'SubTextColor' }];

    // updates the elements' css styles on the page
    let updateColorsStyle = () => {
      listPickers.forEach(({ color: listColor, listType }) => {
        [...document.querySelectorAll('.colorbg.' + listType)].forEach((elem) => {
          elem.style.cssText = `background:${colors[listColor]}!important`;
        });
      });
      [...document.querySelectorAll('.listinfo')].forEach((elem) => {
        elem.style.cssText = `color:${colors.SubTextColor}!important`;
      });
    };
    let setPickerColors = () => {
      allPickers.forEach(({ picker, color }) => picker.setColor(colors[color]));
      updateColorsStyle();
    };

    setPickerColors();

    document.querySelector('.saveColors').onclick = () => {
      GM_setValue('colors', colors);
      setPickerColors();
    };
    document.querySelector('.resetColors').onclick = () => {
      colors = GM_getValue('colors', duplicate(defaultColors));
      setPickerColors();
    };
    document.querySelector('.resetDefaultColors').onclick = () => {
      colors = duplicate(defaultColors);
      setPickerColors();
    };
    document.querySelector('.clearCache').onclick = () => GM_setValue('pages', {});
    document.querySelector('.getVNs').onclick = () => updateUserList(true);

    ['change', 'swatchselect', 'save', 'clear', 'cancel', 'hide', 'show'].forEach((colorEvent) =>
      allPickers.forEach(({ picker, color: pickerColor }) => {
        picker.on(colorEvent, () => {
          colors[pickerColor] = picker.getColor().toRGBA().toString(2);
          updateColorsStyle();
        });
      })
    );
  }

  // make popups for all staff or producer links in the page
  let pages = [...document.querySelectorAll('a[href]')].filter((elem) =>
    elem.href.match(/vndb.org\/[sp]\d+$/)
  );
  for (let entryElem of pages) {
    let visible = false,
      tooltipLoaded = false;
    let span = document.createElement('span');
    entryElem.append(span);
    let tooltip = createElementFromHTML(`<div class="mainbox"><p>Fetching Data</p></div>`);
    tooltip.className += ' tooltip';
    entryElem.prepend(tooltip);

    let makePopper = (parent, elem) => {
      let popperInstance = Popper.createPopper(parent, elem, {
        placement: 'top',
      });
      // if moused over, prioritise getting info of that tooltip
      function show() {
        visible = true;
        if (!tooltipLoaded) {
          console.log('Requesting ' + entryElem.href);
          getPage(entryElem.href, null, (info) => {}, true);
        }
        elem.setAttribute('data-show', '');
        popperInstance.update();
      }
      function hide() {
        visible = false;
        elem.removeAttribute('data-show');
      }
      const showEvents = ['mouseenter', 'focus'];
      const hideEvents = ['mouseleave', 'blur'];
      showEvents.forEach((event) => {
        parent.addEventListener(event, show);
      });
      hideEvents.forEach((event) => {
        parent.addEventListener(event, hide);
      });
      return show;
    };

    makePopper(entryElem, tooltip);

    getPage(entryElem.href, null, (info) => {
      tooltipLoaded = true;
      let newTable;
      if (info.count > 0) {
        newTable = createElementFromHTML(info.table);
        span.innerText = ` (${info.count})`;
      } else {
        newTable = createElementFromHTML(
          `<div class="mainbox"><p>No Novels on List (of ${info.total})</p></div>`
        );
      }
      tooltip = entryElem.replaceChild(newTable, tooltip);
      tooltip = newTable;
      tooltip.className += ' tooltip';
      let show = makePopper(entryElem, tooltip);
      if (visible) show();
    });
  }
})();

let queue = [];
let prioQueue = [];
let resolvers = {};
let active = false;
(async function () {
  while (true) {
    if (active || prioQueue.length > 0) {
      let currURL;
      if (prioQueue.length > 0) {
        currURL = prioQueue.shift();
        queue = queue.filter((queueUrl) => queueUrl != currURL);
        console.log(`Priority: getting ${currURL}, waiting ${delayMs} ms`);
      } else if (queue.length > 0) {
        currURL = queue.shift();
        console.log(`Getting ${currURL}: ${queue.length} pages remaining, waiting ${delayMs} ms`);
      }
      if (currURL) {
        let responseText = await getUrl(currURL);
        resolvers[currURL].forEach((resolver) => resolver(responseText));
      }
    }
    await timer(delayMs);
  }
})();

async function getUrl(url) {
  let response = await fetch(url);
  let waitMs = delayMs;
  while (!response.ok) {
    response = await fetch(url);
    waitMs *= 2;
    delayMs *= 1.2;
    delayMs = Math.round(delayMs);
    console.log('Failed response, new wait:' + waitMs);
    await timer(waitMs);
  }
  return await response.text();
}

(async function () {
  while (true) {
    await timer(1000);
    let currPage = GM_getValue('currPage', null);
    console.log('current page: ', active, 'queue: ', queue.length);
    if (queue.length == 0) {
      console.log('finished fetching');
      active = false;
      return;
    }
    if (currPage == null || currPage?.page == document.URL) {
      GM_setValue('currPage', { page: document.URL, lastUpdate: Date.now() });
      active = true;
    } else {
      if (currPage != null && currPage?.page != document.URL) {
        if (currPage?.lastUpdate + 2000 < Date.now()) {
          GM_setValue('currPage', { page: document.URL, lastUpdate: Date.now() });
          active = true;
        } else active = false;
      }
    }
  }
})();

async function getPage(url, doc = null, updateInfo, priority = false) {
  let type,
    table,
    count = 0,
    total = 0;

  if (!doc) {
    if (url.match('vndb.org/p')) url = 'https://vndb.org/' + url.match(/p\d+/)[0] + '/vn';

    if (GM_getValue('pages', null)[url]) {
      updateInfo(GM_getValue('pages', null)[url]);
      if (GM_getValue('pages', null)[url].lastUpdate + updatePageMs > Date.now()) return;
    }

    if (priority) {
      prioQueue.unshift(url);
      return;
    }

    doc = document.createElement('html');

    let [promise, resolver] = createPromise();
    if (resolvers[url]) resolvers[url].push(resolver);
    else {
      resolvers[url] = [resolver];
      queue.push(url);
    }

    doc.innerHTML = await promise;
  }
  type = getType(url, doc);
  vns = GM_getValue('vns', null);

  // add highlights to vns on list
  let vnElems = [...doc.querySelectorAll(type.vnSelector)];
  let novelelements = '';
  vnElems.forEach((elem) => {
    let vnID = elem.href.split('/').pop();
    if (vns[vnID] && vns[vnID].lists.length > 0) {
      let bgElem = type == types.Staff ? elem.parentElement.parentElement : elem.parentElement;
      bgElem.className += 'colorbg ';
      bgElem.className += vns[vnID].lists.join(' ');
      elem.innerHTML = `<strong>${elem.innerHTML}</strong>
  <span class="listinfo">
    ${vns[vnID].lists.join(', ') + (vns[vnID].vote ? ' | Score: ' + vns[vnID].vote : '')}
  </span>`;

      if (type == types.CompanyVNs) {
        novelelements += elem.parentElement.outerHTML;
      } else {
        novelelements += elem.parentElement.parentElement.outerHTML;
      }
      count++;
    }
    total++;
  });
  if (type == types.Releases) {
    getPage(url, null, updateInfo, priority);
    return;
  }
  table = type.box(novelelements, count + '/' + total);

  updateInfo({ count, total, table });

  let pages = GM_getValue('pages');
  pages[url] = { count, total, lastUpdate: Date.now(), table };
  GM_setValue('pages', pages);
}

function getType(url, doc) {
  if (url.match('vndb.org/s')) return types.Staff;
  else if (url.match('vndb.org/p')) {
    let text = doc.querySelectorAll('.tabselected')[1];
    if (text?.innerText) {
      return text.innerText == 'Releases' ? types.Releases : types.CompanyVNs;
    } else return types.CompanyOther;
  } else if (url.match(/vndb.org\/[vc]/)) {
    return types.VN;
  } else if (url.match(/vndb.org\/u\d+\/edit/)) {
    return types.Settings;
  }
}

async function updateUserList(override = false) {
  console.log('Last List Fetch: ' + new Date(GM_getValue('lastFetch')));
  if (GM_getValue('lastFetch', 0) + fetchListMs < Date.now() || override) {
    console.log('Fetching VN List');
    GM_setValue('lastFetch', Date.now());
    let response = await getUrl(listExportUrl(userID));
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
    inline: true,
    autoReposition: true,
    adjustableNumbers: true,

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
        clear: false,
        save: false,
      },
    },
  };
}

function addPickerStuff(fieldset) {
  fieldset.append(
    createElementFromHTML(`<div class="mainbox">
    <h1>List Highlighter</h1>
    <table class="formtable">
      <tr class="newpart">
        <td>List</td>
      </tr>
      <tr class="newfield">
        <td>
          <input type="button" value="Clear Staff/Producer Cache" class="submit clearCache" />
          <input type="button" value="Fetch VNList" class="submit getVNs" />
        </td>
      </tr>
      <tr class="newpart">
        <td colspan="2">Pick Colors</td>
      </tr>
      <tr class="newfield">
        <td>
          <table style="width: 100%">
            <thead>
              <tr>
                <td class="pickerheader">List Text Color</td>
                <td class="pickerheader">Playing Color</td>
                <td class="pickerheader">Finished Color</td>
                <td class="pickerheader">Stalled Color</td>
                <td class="pickerheader">Dropped Color</td>
                <td class="pickerheader">Wishlist Color</td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><div class="pickerdiv"><button class="color-picker-0"></button></div></td>
                <td><div class="pickerdiv"><button class="color-picker-1"></button></div></td>
                <td><div class="pickerdiv"><button class="color-picker-2"></button></div></td>
                <td><div class="pickerdiv"><button class="color-picker-3"></button></div></td>
                <td><div class="pickerdiv"><button class="color-picker-4"></button></div></td>
                <td><div class="pickerdiv"><button class="color-picker-5"></button></div></td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
      <tr class="newfield">
        <td class="label" style="padding-top:30px">
          <div class="colorbuttons">
            <input type="button" value="Save" class="submit saveColors" />
            <input type="button" value="Reset" class="submit resetColors" />
            <input type="button" value="Reset to Defaults" class="submit resetDefaultColors" />
          </div>
        </td>
      </tr>
    </table>
  </div>
  `)
  );
  fieldset.append(
    createElementFromHTML(`<div class="mainbox browse staffroles">
    <p>Test List</p>
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
      <tbody><tr><td class="tc1"><a href="/v16201" title="あま恋シロップス ～恥じらう恋心でシたくなる甘神様の恋祭り～">Ama Koi Syrups ~Hajirau Koigokoro de Shitaku Naru Amagami...</a></td><td class="tc2">2015-02-27</td><td class="tc3"><a href="/c92173" title="こころ">Kokoro</a></td><td class="tc4" title="遥 そら">Haruka Sora</td><td class="tc5"></td></tr><tr><td class="tc1"><a href="/v16201" title="あま恋シロップス ～恥じらう恋心でシたくなる甘神様の恋祭り～">Ama Koi Syrups ~Hajirau Koigokoro de Shitaku Naru Amagami...</a></td><td class="tc2">2015-02-27</td><td class="tc3"><a href="/c41323" title="まんじゅう様">Manjuu-sama</a></td><td class="tc4" title="遥 そら">Haruka Sora</td><td class="tc5"></td></tr><tr class="colorbg Finished Voted"><td class="tc1"><a href="/v16044" title="サノバウィッチ">
  <strong>
    Sanoba Witch
  </strong>
  <span class="listinfo">
    Finished, Voted | Score: 10
  </span></a></td><td class="tc2">2015-02-27</td><td class="tc3"><a href="/c26598" title="因幡 めぐる">Inaba Meguru</a></td><td class="tc4" title="遥 そら">Haruka Sora</td><td class="tc5"></td></tr><tr><td class="tc1"><a href="/v17969" title="はにかみ CLOVER">Hanikami Clover</a></td><td class="tc2">2016-01-29</td><td class="tc3"><a href="/c36027" title="周防 えみる">Suou Emiru</a></td><td class="tc4" title="遥 そら">Haruka Sora</td><td class="tc5"></td></tr><tr><td class="tc1"><a href="/v18147" title="間宮くんちの五つ子事情">Mamiya-kunchi no Itsutsugo Jijou</a></td><td class="tc2">2016-02-26</td><td class="tc3"><a href="/c38570" title="四条院 莉里香">Shijouin Ririka</a></td><td class="tc4" title="遥 そら">Haruka Sora</td><td class="tc5"></td></tr><tr class="colorbg Wishlist Wishlist-Medium"><td class="tc1"><a href="/v18148" title="ノラと皇女と野良猫ハート">
  <strong>
    Nora to Oujo to Noraneko Heart
  </strong>
  <span class="listinfo">
    Wishlist, Wishlist-Medium
  </span></a></td><td class="tc2">2016-02-26</td><td class="tc3"><a href="/c40408" title="黒木 未知">Kuroki Michi</a></td><td class="tc4" title="遥 そら">Haruka Sora</td><td class="tc5"></td></tr><tr><td class="tc1"><a href="/v18651" title="時を紡ぐ約束">Toki o Tsumugu Yakusoku</a></td><td class="tc2">2016-03-25</td><td class="tc3"><a href="/c41585" title="沢村 唯依">Sawamura Yui</a></td><td class="tc4" title="遥 そら">Haruka Sora</td><td class="tc5"></td></tr><tr><td class="tc1"><a href="/v20602" title="真剣で私に恋しなさい！A-5">Maji de Watashi ni Koishinasai! A-5</a></td><td class="tc2">2016-04-26</td><td class="tc3"><a href="/c56412" title="シェイラ・コロンボ">Sheila Colombo</a></td><td class="tc4" title="遥 そら">Haruka Sora</td><td class="tc5"></td></tr><tr class="colorbg Dropped"><td class="tc1"><a href="/v17742" title="D.S. -Dal Segno-">
  <strong>
    D.S. -Dal Segno-
  </strong>
  <span class="listinfo">
    Dropped
  </span></a></td><td class="tc2">2016-04-28</td><td class="tc3"><a href="/c36022" title="神月 依愛">Kouzuki Io</a></td><td class="tc4" title="遥 そら">Haruka Sora</td><td class="tc5"></td></tr><tr><td class="tc1"><a href="/v19141" title="クランク・イン">Crank In</a></td><td class="tc2">2017-08-31</td><td class="tc3"><a href="/c64225" title="村雲 望">Murakumo Nozomu</a></td><td class="tc4" title="仙台 エリ">Sendai Eri</td><td class="tc5"></td></tr><tr><td class="tc1"><a href="/v19841" title="ノラと皇女と野良猫ハート2">Nora to Oujo to Noraneko Heart 2</a></td><td class="tc2">2017-10-27</td><td class="tc3"><a href="/c40408" title="黒木 未知">Kuroki Michi</a></td><td class="tc4" title="遥 そら">Haruka Sora</td><td class="tc5"></td></tr><tr class="colorbg Playing"><td class="tc1"><a href="/v21852" title="金色ラブリッチェ">
  <strong>
    Kin'iro Loveriche
  </strong>
  <span class="listinfo">
    Playing
  </span></a></td><td class="tc2">2017-12-22</td><td class="tc3"><a href="/c64303" title="妃 玲奈">Kisaki Reina</a></td><td class="tc4" title="遥 そら">Haruka Sora</td><td class="tc5"></td></tr>
<tr><td class="tc1"><a href="/v25725" title="SHUFFLE! エピソード2～神にも悪魔にも狙われている男～">Shuffle! Episode 2 ~Kami ni mo Akuma ni mo Nerawareteiru ...</a></td><td class="tc2">2020-05-29</td><td class="tc3"><a href="/c85213" title="リムストン">Limestone</a></td><td class="tc4" title="遥 そら">Haruka Sora</td><td class="tc5"></td></tr><tr><td class="tc1"><a href="/v29057" title="我が姫君に栄冠を">Waga Himegimi ni Eikan o</a></td><td class="tc2">2021-03-26</td><td class="tc3"><a href="/c92523" title="ユーミル">Ymir</a></td><td class="tc4" title="遥 そら">Haruka Sora</td><td class="tc5"></td></tr><tr class="colorbg Stalled"><td class="tc1"><a href="/v30724" title="悠久のカンパネラ">Yuukyuu no Campanella</a><span class="listinfo">Stalled</span></td><td class="tc2"><b class="future">2021-07-30</b></td><td class="tc3"><a href="/c96288" title="シャルロット・ヴィ・アトラスティア">Charlotte vie Atrustia</a></td><td class="tc4" title="遥 そら">Haruka Sora</td><td class="tc5"></td></tr></tbody>
    </table>
  </div>`)
  );
}

function duplicate(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function createPromise() {
  let resolver;
  return [
    new Promise((resolve, reject) => {
      resolver = resolve;
    }),
    resolver,
  ];
}
