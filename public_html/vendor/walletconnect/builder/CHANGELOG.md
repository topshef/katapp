# kwc (kpay walletconnect) CHANGELOG

Repository: https://github.com/topshef/phpjabbers

<!--
  Snapgate changelog file.
  New releases are inserted below the marker.
  Do NOT remove the marker line.
-->

<!-- INSERT_HERE -->
## kwc-v0.0.23

fix default location for config.json

- [6bd6e71](https://github.com/topshef/phpjabbers/commit/6bd6e71ac6822b9a6c94d3f9d59b4e9f51be205c) #46 #52 fix default config location finding (2026-02-18)
- [a02c13b](https://github.com/topshef/phpjabbers/commit/a02c13b19d3db7abc05626bc0e752c4236dfce35) #46 #52 todo fix issue with config location depending on where the calling page is (2026-02-18)
## kwc-v0.0.22

testing HMR vite

- [404cce4](https://github.com/topshef/phpjabbers/commit/404cce4161ecce3be7f6765d63bbcb07e09e179e) #46 #52 notes on how dev mode works (2026-02-18)
- [7aa617b](https://github.com/topshef/phpjabbers/commit/7aa617b4fa0b8d46a9b1d1480a316b5e334affa2) #46 #52 support dev mode - Vite HMR (Hot Module Replacement) (2026-02-18)

## kwc-v0.0.21

testing hotswap bundles etc

- [ec15ded](https://github.com/topshef/phpjabbers/commit/ec15ded6c01a929d5590b5df578566880e0479d3) #46 #52 allow url kwc_version as semver or commit hex (2026-02-17)
- [e75d952](https://github.com/topshef/phpjabbers/commit/e75d9523926dc43a1f964686ac7d8023b0ddf467) #46 #52 inject build info to bundle via env (2026-02-17)
- [a6e5ca5](https://github.com/topshef/phpjabbers/commit/a6e5ca59dfa0ef634b4be2a7a44f82efd32c7e22) #46 #52 hotswap kwc bundle from url.. or choose commit snapshot (2026-02-17)
- [0984c91](https://github.com/topshef/phpjabbers/commit/0984c91cbf06cc75704685db1944fb410acdc38b) #46 #52 hotswap kwc bundle from url (2026-02-17)
- [89d4a61](https://github.com/topshef/phpjabbers/commit/89d4a61f7155e90bcceb0251b37a28fd3f436d89) #46 #52 use kwc latest on swap.kpay (2026-02-17)

## kwc-v0.0.20

testing various deployment ideas

- [443d849](https://github.com/topshef/phpjabbers/commit/443d8492c4dcf6470e1d6d704300db1d70c6697a) #46 #52 script tag for kwc.. todo cross oriign (2026-02-17)
- [1f5d2d7](https://github.com/topshef/phpjabbers/commit/1f5d2d732bd8cadaa8f8a1f9d3a00162c3293861) #46 #52 #31 md htaccess, and snapgate ghjkl (2026-02-17)
- [577e630](https://github.com/topshef/phpjabbers/commit/577e630b022ba548a6d9b6bf92539b63409ad4fc) #46 #52 rsync kwc releases (2026-02-17)
- [f446031](https://github.com/topshef/phpjabbers/commit/f446031c2be98b19d81e1d7819d15fa31d6c2f6a) #46 #52 #31 htaccess cors cache etc serving kwc bundles (2026-02-17)

## kwc-v0.0.19

dev and test release process

- [b746a1c](https://github.com/topshef/phpjabbers/commit/b746a1cb7b7336c3586e1b0a75a99eacda5dffda) #46 #52 route kwc bundles via htaccess (2026-02-17)

## kwc-v0.0.18

regression testing - work on release process only

- [5fccc1c](https://github.com/topshef/phpjabbers/commit/5fccc1ca0c465912a5ae718f4e05085a7e978b05) #46 #52 scrap legacy version of buildInfo (2026-02-17)
- [03fc5db](https://github.com/topshef/phpjabbers/commit/03fc5dbf68a20922f27dc195256154b64f82c866) #46 #52 remove archive folder etc (2026-02-17)
- [2d2c433](https://github.com/topshef/phpjabbers/commit/2d2c4330cca8b9b6d0c8ba9401df948631a0d01a) #46 #52 rework always to dist, then releases if tagged (2026-02-17)
- [17fd6b0](https://github.com/topshef/phpjabbers/commit/17fd6b05fd3fbb4958afce410cb1541e4d5093f9) #46 #52 rework always to dist, then releases if tagged (2026-02-17)
- [e94203c](https://github.com/topshef/phpjabbers/commit/e94203c74c7d9179fb691a582dd51f5107f32c49) #46 #52 wip remove prod ref. use released and snapshot (commit)... (2026-02-17)
- [d49a7a9](https://github.com/topshef/phpjabbers/commit/d49a7a989b45f0e165988980011458553e07ba85) #46 #52 rename (2026-02-17)
- [39c07bb](https://github.com/topshef/phpjabbers/commit/39c07bb6a9d95594d846834367bc6748b3ae1512) #52 pulling teeeth demo release version finally (2026-02-17)

## kwc-v0.0.17

- [0b116dd](https://github.com/topshef/phpjabbers/commit/0b116dded75b78de67a30f4290a46db64de04007) #52 ghjkl new bundle (2026-02-16)
- [cd6fe8c](https://github.com/topshef/phpjabbers/commit/cd6fe8c2fa99a222b87d3c7799ee7cd3bfeb91a9) #52 try again snapgate kwc (2026-02-16)
- 

## kwc-v0.0.16

- [051dde5](https://github.com/topshef/phpjabbers/commit/051dde52543e8c633fb650b6a8a88384dfdb4931) #52 backpeddle ai (2026-02-16)

## kwc-v0.0.15

- [d586b57](https://github.com/topshef/phpjabbers/commit/d586b57ab9244bfebe80cfe2389052f144d6f72e) #52 #46 todo make snapgate push to releases folder? deploy/vite is fighting for the dist folder (2026-02-16)

## kwc-v0.0.14

- [5812fb4](https://github.com/topshef/phpjabbers/commit/5812fb4a77e7b2da6a15a059ad94d43f1c7d2b05) #52 test rebundle without snapgate version change - so this woudl be used as 'working' only (2026-02-16)
- [6bdf059](https://github.com/topshef/phpjabbers/commit/6bdf05975e0ff12d9ae084f76f4821eac4692eb5) #52 todo review build info (snapgate) and deployment process (2026-02-16)

## kwc-v0.0.13

_Initial release_

- [6d3f458](https://github.com/topshef/phpjabbers/commit/6d3f4588a43e4a6d41c77330b6657a5b9b216dff) #46 snapgate if no existing tags found then add to change log as initial release (2026-02-16)
- [1188acf](https://github.com/topshef/phpjabbers/commit/1188acfc176eaccfffe8bf9d4060a9bd8ae37344) #46 snapgate init changelog. own package.json for version truth (2026-02-16)

## kwc-v0.0.12 (legacy change history)

- [fbd62be](https://github.com/topshef/phpjabbers/commit/fbd62be93fe63993a8143ab29ee8bac53a470c54) #52 cleanup archive etc (2026-02-16)

- [b427ed7](https://github.com/topshef/phpjabbers/commit/b427ed70f6c9de993ee80b427408cd79b61a7a36) #52 #46 prep version control for KWC bundle (kpay walletconnect) (2026-02-16)
  
  [bdee7de](https://github.com/topshef/phpjabbers/commit/bdee7de733e44bc5acbfe3c82a8d5575b3fd1a54) #52 #50 hide WC connect when connected etc (2026-02-11)

- [37e0db9](https://github.com/topshef/phpjabbers/commit/37e0db9ab2c44ee7a7cc1bb556f4781e1a7aa9e2) #45 #52 fix dogshit ai and passthru starttime (2026-02-08)

- [994f854](https://github.com/topshef/phpjabbers/commit/994f854f24fe7d8938738dce00e971753d015da1) #52 #50 revert OG page to hashconnect. only v=labs for walletconnect (2026-02-08)

- [ef04569](https://github.com/topshef/phpjabbers/commit/ef0456996f011e6193c9c566b14547b38b1445dc) #52 tx submit does not mean tx success. todo port result info from hashconnect flow (2026-02-08)

- [cfa4e1d](https://github.com/topshef/phpjabbers/commit/cfa4e1dc5671a8421883cea724b7f931f5268a46) #52 #45 wire thru new sigs info. deprecate in-bundle txSave (2026-02-07)

- [54304fc](https://github.com/topshef/phpjabbers/commit/54304fc1182cfcc2d24db23a4bd05e1f64384533) #52 #45 move kpool wrapper to /future and cleanup remap to /sign so works same from both paths (/sign is needed to work within hashpack) (2026-02-07)

- [44daa43](https://github.com/topshef/phpjabbers/commit/44daa4335a9cd747f57f9020ad87204fc1d31cb0) #52 #45 add tracers, and lessons learnt JS flow (2026-02-07)

- [cfcba11](https://github.com/topshef/phpjabbers/commit/cfcba11934fbcd33b999a4c155e678cf81295c57) #52 #45 double saving tx whilst we separate concerns (2026-02-07)

- [248ff4d](https://github.com/topshef/phpjabbers/commit/248ff4ddc30906120717e1e36e5141f71a3816d7) #52 #45 default walletconnect. fetch locally txRead. todo txSave locally so hashpack browser can handle (2026-02-07)

- [114b255](https://github.com/topshef/phpjabbers/commit/114b25596d3a3efd7192773fa10cf21c9555bff4) #52 #45 only show legacy or new, not both. todo mucho tidy up (2026-02-06)

- [7a910d2](https://github.com/topshef/phpjabbers/commit/7a910d2f2e94901b54137b5582190475f1940adb) #52 #45 standalone signer hook seems to be working. todo full test and tidy up (2026-02-05)

- [d87a62b](https://github.com/topshef/phpjabbers/commit/d87a62b6cccf220c548fb8e7ba7277491b113305) #52 #45 todo debug why WC signing not coming thru (2026-02-03)

- [c5888b4](https://github.com/topshef/phpjabbers/commit/c5888b44942e56280952b6afc7f48d2aa539ad0b) #52 #45 dogshit still but wc is signing, now need save result (2026-02-03)

- [ed4f146](https://github.com/topshef/phpjabbers/commit/ed4f14658b7a7e24f6944e7bf1e0104e5115c44d) #52 #45 dogshit but better (2026-02-02)

- [ae3dfcb](https://github.com/topshef/phpjabbers/commit/ae3dfcba2c6644b2010e8d20e08c9d88844a6447) #52 #45 being wire wc connect disconnect ok but messy. todo sign tx headless hook (2026-02-02)

- [8603ae4](https://github.com/topshef/phpjabbers/commit/8603ae45d0078d0247d45ff50e925e68058e7b33) #52 prep extract walletconnect core - remove dep on ui (2026-01-29)

- [ca948cf](https://github.com/topshef/phpjabbers/commit/ca948cf05dc3b7ba091d2530b80981a6a6a45e2b) #52 reorder a bit (2026-01-29)

- [1dc42d4](https://github.com/topshef/phpjabbers/commit/1dc42d457b5db9bfef5541304ff9e365a9d5088e) #52 refactor kill nerdfuck arrow functions ahead of re-ordering (2026-01-29)

- [1adc041](https://github.com/topshef/phpjabbers/commit/1adc041c07a0c43797819a6376e28749eb656b3e) #52 oops nerdfuck arrow functions dont hoist.. reorder (2026-01-29)

- [bfd9a93](https://github.com/topshef/phpjabbers/commit/bfd9a938b2099dfcddc6ae035d48b3cf99aa8d2e) #52 expose headless option, without removing default behaviour (2026-01-29)

- [9bf91ff](https://github.com/topshef/phpjabbers/commit/9bf91ff470a43959e4f3214cf732b91da5a6b042) #52 refactor to headless.. exec deal flow (2026-01-29)

- [97cd4e7](https://github.com/topshef/phpjabbers/commit/97cd4e7416d3bda48cdaef9be16e5bac755b19cb) #52 refactor continuing headless split (2026-01-29)

- [84f1873](https://github.com/topshef/phpjabbers/commit/84f1873cb3ad3ff4d2dbc053e1e693653521cae3) #52 refactor session restore (2026-01-29)

- [870a620](https://github.com/topshef/phpjabbers/commit/870a620f112a03423cb9dfefa902b96a873c4cf6) #52 refactor disconnect - split headless vs trigger (2026-01-29)

- [474d92e](https://github.com/topshef/phpjabbers/commit/474d92ee62a7d682debeeef692cba172f5c68e79) #52 begin refactor to split core intention from UI trigger, to support eg xproof buttonless implementations (2026-01-29)

- [729c0fc](https://github.com/topshef/phpjabbers/commit/729c0fcebcb844870a390e06f1bade79541d746f) #52 include build ID in script MD file (2026-01-29)

- [8204cc3](https://github.com/topshef/phpjabbers/commit/8204cc3b9b04000b99b0b67d5cf31e5a89f3f60a) #52 park ok (2026-01-28)

- [72469a9](https://github.com/topshef/phpjabbers/commit/72469a9344525efd07a6f2a3226eb4b254b139cb) #52 save futured dated tx to kpool #45 #48 (2026-01-28)

- [c736d08](https://github.com/topshef/phpjabbers/commit/c736d08e26952d89330d0f33ac684fd955ddd410) #52 save tx to pool and report (2026-01-28)

- [04694cf](https://github.com/topshef/phpjabbers/commit/04694cf01cad78f14614e00391023ed26a621a81) #52 move build info to own file buildInfo.js updated by deploy.sh (2026-01-28)

- [5dcffe4](https://github.com/topshef/phpjabbers/commit/5dcffe47be111987f020492282ef004b236dc09b) #52 deployment build id is just timestamp (2026-01-28)

- [702adfe](https://github.com/topshef/phpjabbers/commit/702adfe689d3268923cabf3b25e8a423b214879b) #52 deploy increments versions.. .but see next commit move to datestamp simpler (2026-01-28)

- [e5407df](https://github.com/topshef/phpjabbers/commit/e5407dfdfa7246c0a7877c60d7284f742f3808ea) #52 highlight the main function executeDealFlow (2026-01-28)

- [b4aa5b9](https://github.com/topshef/phpjabbers/commit/b4aa5b91f03c785228266850c295e5d54f5d2503) #52 code comments pre refactor (2026-01-28)

- [d65ef94](https://github.com/topshef/phpjabbers/commit/d65ef94ee8ef53e025b5c52c8f3fd4219ae858ff) #52 begin add in future dating (2026-01-28)

- [a3b3d27](https://github.com/topshef/phpjabbers/commit/a3b3d27d2354c2da83b554b48d975eacb6eba61d) #52 stub switch for sign vs submit (2026-01-28)

- [9bb9ae9](https://github.com/topshef/phpjabbers/commit/9bb9ae93a0b1cb898e0455bf17612da442fe0a28) #52 go nuclear on og page, swap hashconnect for walletconnect. TODO future dated tx (2026-01-27)

- [56d3ec8](https://github.com/topshef/phpjabbers/commit/56d3ec86a92591f4f55c92f3089381f6541075b7) #52 extract click handlers (2026-01-27)

- [319d356](https://github.com/topshef/phpjabbers/commit/319d356576512b2b5914deeb9ca2b18f1dcdaf27) #52 begin extract click handlers (2026-01-27)

- [68db975](https://github.com/topshef/phpjabbers/commit/68db975b6ae954e502ec3ba4e995fe0e6542fe41) #52 only render widget if requested by placing id='katomic-widget' (2026-01-27)

- [1728176](https://github.com/topshef/phpjabbers/commit/1728176957fec4f8676fd05e592924e9e89ca9ee) #52 denerd the loader crap a bit (2026-01-27)

- [6a0e15a](https://github.com/topshef/phpjabbers/commit/6a0e15a52d8926ea5e52c8647960a11f4cf16146) #52 handle base ref override. always default to bundle location for the config unless data-config points otherwise (2026-01-27)

- [2554205](https://github.com/topshef/phpjabbers/commit/255420586c2b97689f8d47f6a7131f2c744fec9e) #52 oop dont track archives (2026-01-27)

- [5bfef5e](https://github.com/topshef/phpjabbers/commit/5bfef5e6ca4cb9e0ee9f1a076c438b6ac68bbb43) #52 deploy script (2026-01-27)

- [13c6822](https://github.com/topshef/phpjabbers/commit/13c6822501604392be8206f2d2703ef539f367bd) #52 fix extraneous alerts (2026-01-27)

- [520035e](https://github.com/topshef/phpjabbers/commit/520035e8e48f9c751ddccc308a6cb99450ac09d2) #46 #52 kbuild seems to work alongside ok (2026-01-27)

- [522bf72](https://github.com/topshef/phpjabbers/commit/522bf72e5e1044483f1a3e58327bbce7f369b488) #46 fix the overlay click issue in banner, but it intros bug in #52 we'll fix that next, for now commenting out banner (2026-01-27)

- [8b613f2](https://github.com/topshef/phpjabbers/commit/8b613f256890784decc98e0e23401d41ee8a5cc7) #46 extract build banner thingy to reusable module for other pages eg #52 dev (2026-01-27)

- [77d43f1](https://github.com/topshef/phpjabbers/commit/77d43f1bd7011f791c0d1fe2ad55ea0091244f3f) #52 working demo ported from shimanto, some tweaks needed (2026-01-27)

- [6062195](https://github.com/topshef/phpjabbers/commit/6062195b0d2e73887cc69f8b15293ced86063c1b) #52 park need more ram to build min 2GB, use another server (2026-01-27)

- [b416650](https://github.com/topshef/phpjabbers/commit/b416650dc0c641015897ed1f436e9092f8dc825d) #52 swap to shimanto code. todo rewire config location (2026-01-27)

- [3688e90](https://github.com/topshef/phpjabbers/commit/3688e907a72990748a781f4879af7a896e1edd86) #52 add modal to connect to desktop chrome extension or via qr (2026-01-25)

- [15ec156](https://github.com/topshef/phpjabbers/commit/15ec1568d56cd8532bce18638c1cb69fe5c51b0d) #52 basic QR scan code test connection to mobile wallet ok (2026-01-25)

- [0097dca](https://github.com/topshef/phpjabbers/commit/0097dca63cfa1f572aac61fbdfbeb08ab9d3446c) #52 basic wiring test, plus config (2026-01-25)

- [bde765e](https://github.com/topshef/phpjabbers/commit/bde765ede6127a6e837350a3487f84416567e7f1) #52 more AI shite Add connect URI callback and error handling (2026-01-25)

- [fa40be8](https://github.com/topshef/phpjabbers/commit/fa40be834f2525ae2caa09527a2cc12ecdad3214) #52 begin port walletconnect ref shimanto migration (2026-01-25)

- [13e7f8f](https://github.com/topshef/phpjabbers/commit/13e7f8f9795bc24fcc5c11cc517f57f1da624982) #52 fucking about (2026-01-25)

- [df8be26](https://github.com/topshef/phpjabbers/commit/df8be269ab8c31c76d1cff019d63bfe8eb60bf7f) #52 strip down labs to walletconnect only. fix wiring names. todo cleanup (2026-01-25)

- [adfd3b2](https://github.com/topshef/phpjabbers/commit/adfd3b285de86ff1888c762c804d5dd02753ec60) #52 add project id input for walletconnect (2025-03-05)

- [6c77fc7](https://github.com/topshef/phpjabbers/commit/6c77fc779a413f9e08c64917726fbdfaf6bfdf1f) #52 link walletconnect to cdn on labs1 kpay (2025-03-05)

- [d68fa92](https://github.com/topshef/phpjabbers/commit/d68fa92ab472d40b92a93b2023b2d9e5a5ce5081) #52 (on hold) add walletconnect to labs (2025-02-24)

- [a27f514](https://github.com/topshef/phpjabbers/commit/a27f514c9b1084ca9a62397ffc387ac1ee87bb78) #52 add walletconnect bundle (2025-02-24)
