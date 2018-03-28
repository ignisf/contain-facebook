// Param values from https://developer.mozilla.org/Add-ons/WebExtensions/API/contextualIdentities/create
const LINKEDIN_CONTAINER_NAME = "LinkedIn";
const LINKEDIN_CONTAINER_COLOR = "blue";
const LINKEDIN_CONTAINER_ICON = "fingerprint";

const LINKEDIN_TLD = "linkedin.com";
const LINKEDIN_SUBDOMAINS = ['af', 'ax', 'al', 'dz', 'as', 'ad', 'ao', 'ai',
                             'aq', 'ag', 'ar', 'am', 'aw', 'au', 'at', 'az',
                             'bs', 'bh', 'bd', 'bb', 'by', 'be', 'bz', 'bj',
                             'bm', 'bt', 'bo', 'bq', 'ba', 'bw', 'bv', 'br',
                             'io', 'bn', 'bg', 'bf', 'bi', 'cv', 'kh', 'cm',
                             'ca', 'ky', 'cf', 'td', 'cl', 'cn', 'cx', 'cc',
                             'co', 'km', 'cg', 'cd', 'ck', 'cr', 'ci', 'hr',
                             'cu', 'cw', 'cy', 'cz', 'dk', 'dj', 'dm', 'do',
                             'ec', 'eg', 'sv', 'gq', 'er', 'ee', 'et', 'fk',
                             'fo', 'fj', 'fi', 'fr', 'gf', 'pf', 'tf', 'ga',
                             'gm', 'ge', 'de', 'gh', 'gi', 'gr', 'gl', 'gd',
                             'gp', 'gu', 'gt', 'gg', 'gn', 'gw', 'gy', 'ht',
                             'hm', 'va', 'hn', 'hk', 'hu', 'is', 'in', 'id',
                             'ir', 'iq', 'ie', 'im', 'il', 'it', 'jm', 'jp',
                             'je', 'jo', 'kz', 'ke', 'ki', 'kp', 'kr', 'kw',
                             'kg', 'la', 'lv', 'lb', 'ls', 'lr', 'ly', 'li',
                             'lt', 'lu', 'mo', 'mk', 'mg', 'mw', 'my', 'mv',
                             'ml', 'mt', 'mh', 'mq', 'mr', 'mu', 'yt', 'mx',
                             'fm', 'md', 'mc', 'mn', 'me', 'ms', 'ma', 'mz',
                             'mm', 'na', 'nr', 'np', 'nl', 'nc', 'nz', 'ni',
                             'ne', 'ng', 'nu', 'nf', 'mp', 'no', 'om', 'pk',
                             'pw', 'ps', 'pa', 'pg', 'py', 'pe', 'ph', 'pn',
                             'pl', 'pt', 'pr', 'qa', 're', 'ro', 'ru', 'rw',
                             'bl', 'sh', 'kn', 'lc', 'mf', 'pm', 'vc', 'ws',
                             'sm', 'st', 'sa', 'sn', 'rs', 'sc', 'sl', 'sg',
                             'sx', 'sk', 'si', 'sb', 'so', 'za', 'gs', 'ss',
                             'es', 'lk', 'sd', 'sr', 'sj', 'sz', 'se', 'ch',
                             'sy', 'tw', 'tj', 'tz', 'th', 'tl', 'tg', 'tk',
                             'to', 'tt', 'tn', 'tr', 'tm', 'tc', 'tv', 'ug',
                             'ua', 'ae', 'gb', 'us', 'um', 'uy', 'uz', 'vu',
                             've', 'vn', 'vg', 'vi', 'wf', 'eh', 'ye', 'zm',
                             'zw', 'www']

const LINKEDIN_DOMAINS = [LINKEDIN_TLD].concat(LINKEDIN_SUBDOMAINS.map(function(subdomain){
    return(subdomain + '.' + LINKEDIN_TLD);
}));

const MAC_ADDON_ID = "@testpilot-containers";

let linkedInCookieStoreId = null;

const linkedInHostREs = [];

async function isLinkedInAlreadyAssignedInMAC () {
  let macAddonInfo;
  // If the MAC add-on isn't installed, return false
  try {
    macAddonInfo = await browser.management.get(MAC_ADDON_ID);
  } catch (e) {
    return false;
  }
  let anyFBDomainsAssigned = false;
  for (let linkedInDomain of LINKEDIN_DOMAINS) {
    const linkedInCookieUrl = `https://${linkedInDomain}/`;
    const assignment = await browser.runtime.sendMessage(MAC_ADDON_ID, {
      method: "getAssignment",
      url: linkedInCookieUrl
    });
    if (assignment) {
      anyFBDomainsAssigned = true;
    }
  }
  return anyFBDomainsAssigned;
}

(async function init() {
  const linkedInAlreadyAssigned = await isLinkedInAlreadyAssignedInMAC();
  if (linkedInAlreadyAssigned) {
    return;
  }

  // Clear all linkedIn cookies
  for (let linkedInDomain of LINKEDIN_DOMAINS) {
    linkedInHostREs.push(new RegExp(`^(.*)?${linkedInDomain}$`));
    const linkedInCookieUrl = `https://${linkedInDomain}/`;

    browser.cookies.getAll({domain: linkedInDomain}).then(cookies => {
      for (let cookie of cookies) {
        browser.cookies.remove({name: cookie.name, url: linkedInCookieUrl});
      }
    });
  }

  // Use existing LinkedIn container, or create one
  browser.contextualIdentities.query({name: LINKEDIN_CONTAINER_NAME}).then(contexts => {
    if (contexts.length > 0) {
      linkedInCookieStoreId = contexts[0].cookieStoreId;
    } else {
      browser.contextualIdentities.create({
        name: LINKEDIN_CONTAINER_NAME,
        color: LINKEDIN_CONTAINER_COLOR,
        icon: LINKEDIN_CONTAINER_ICON}
      ).then(context => {
        linkedInCookieStoreId = context.cookieStoreId;
      });
    }
  });

  // Listen to requests and open LinkedIn into its Container,
  // open other sites into the default tab context
  async function containLinkedIn(options) {
    const requestUrl = new URL(options.url);
    let isLinkedIn = false;
    for (let linkedInHostRE of linkedInHostREs) {
      if (linkedInHostRE.test(requestUrl.host)) {
        isLinkedIn = true;
        break;
      }
    }
    const tab = await browser.tabs.get(options.tabId);
    const tabCookieStoreId = tab.cookieStoreId;
    if (isLinkedIn) {
      if (tabCookieStoreId !== linkedInCookieStoreId && !tab.incognito) {
        // See https://github.com/mozilla/contain-firefox/issues/23
        // Sometimes this add-on is installed but doesn't get a facebookCookieStoreId ?
        if (linkedInCookieStoreId) {
          browser.tabs.create({url: requestUrl.toString(), cookieStoreId: linkedInCookieStoreId});
          browser.tabs.remove(options.tabId);
          return {cancel: true};
        }
      }
    } else {
      if (tabCookieStoreId === linkedInCookieStoreId) {
        browser.tabs.create({url: requestUrl.toString()});
        browser.tabs.remove(options.tabId);
        return {cancel: true};
      }
    }
  }

  // Add the request listener
  browser.webRequest.onBeforeRequest.addListener(containLinkedIn, {urls: ["<all_urls>"], types: ["main_frame"]}, ["blocking"]);
})();
