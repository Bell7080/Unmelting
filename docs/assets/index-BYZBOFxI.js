var M=Object.defineProperty;var S=(n,e,t)=>e in n?M(n,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):n[e]=t;var s=(n,e,t)=>S(n,typeof e!="symbol"?e+"":e,t);(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))a(r);new MutationObserver(r=>{for(const i of r)if(i.type==="childList")for(const c of i.addedNodes)c.tagName==="LINK"&&c.rel==="modulepreload"&&a(c)}).observe(document,{childList:!0,subtree:!0});function t(r){const i={};return r.integrity&&(i.integrity=r.integrity),r.referrerPolicy&&(i.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?i.credentials="include":r.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function a(r){if(r.ep)return;r.ep=!0;const i=t(r);fetch(r.href,i)}})();class ${constructor(e="unmelting-girl",t="The Unmelting Girl"){s(this,"id");s(this,"name");s(this,"health");s(this,"maxHealth");s(this,"damage");s(this,"items");s(this,"turn");this.id=e,this.name=t,this.health=20,this.maxHealth=20,this.damage=1,this.items=[],this.turn=0}takeDamage(e){const t=Math.max(0,e);return this.health=Math.max(0,this.health-t),t}heal(e){const t=Math.min(e,this.maxHealth-this.health);return this.health=Math.min(this.maxHealth,this.health+t),t}addItem(e){this.items.push(e)}removeItem(e){if(e<0||e>=this.items.length)return null;const t=this.items[e];return this.items.splice(e,1),t}getItems(){return[...this.items]}applyDamageBoost(){this.damage+=1}resetDamageBoost(){this.damage=1}isAlive(){return this.health>0}nextTurn(){this.turn++,this.resetDamageBoost()}reset(){this.health=this.maxHealth,this.damage=1,this.items=[],this.turn=0}}const d=4;class m{constructor(e,t){s(this,"id");s(this,"index");s(this,"cards");this.id=e,this.index=t,this.cards=new Array(d).fill(null)}setCardAtDistance(e,t){return e<0||e>=d?!1:(this.cards[e]=t,!0)}getCardAtDistance(e){return e<0||e>=d?null:this.cards[e]}getClosestCard(){return this.cards[0]}advanceCards(){const e=this.cards[0];for(let t=0;t<d-1;t++)this.cards[t]=this.cards[t+1];return this.cards[d-1]=null,e}addCardAtDistance(e,t){if(e<0||e>=d)return!1;const a=this.cards[e];return a&&a.type===t.type&&a.name===t.name?(a.merge(t),!0):a?!1:(this.cards[e]=t,!0)}removeCard(e){const t=this.cards.indexOf(e);return t===-1?!1:(this.cards[t]=null,!0)}removeCardAtDistance(e){if(e<0||e>=d)return null;const t=this.cards[e];return this.cards[e]=null,t}hasCards(){return this.cards.some(e=>e!==null)}getAllCards(){return this.cards.filter(e=>e!==null)}clear(){this.cards.fill(null)}clone(){const e=new m(this.id,this.index);return e.cards=this.cards.map(t=>t?t.clone():null),e}}class R{constructor(){s(this,"character");s(this,"lanes");s(this,"currentTurn");s(this,"isGameOver");s(this,"gameOverReason");this.character=new $,this.lanes=[new m("lane-0",0),new m("lane-1",1),new m("lane-2",2)],this.currentTurn=0,this.isGameOver=!1,this.gameOverReason=""}getCharacter(){return this.character}getLanes(){return this.lanes}getLane(e){return e<0||e>=this.lanes.length?null:this.lanes[e]}getCurrentTurn(){return this.currentTurn}nextTurn(){this.currentTurn++,this.character.nextTurn()}advanceAllCards(){const e=[];for(const t of this.lanes){const a=t.advanceCards();a&&e.push(a)}return e}findCard(e){for(const t of this.lanes)for(let a=0;a<d;a++){const r=t.getCardAtDistance(a);if((r==null?void 0:r.id)===e)return{lane:t,distance:a}}return null}endGame(e){this.isGameOver=!0,this.gameOverReason=e}reset(){this.character.reset(),this.lanes.forEach(e=>e.clear()),this.currentTurn=0,this.isGameOver=!1,this.gameOverReason=""}}var o=(n=>(n.ENEMY="enemy",n.TRAP="trap",n.TREASURE="treasure",n))(o||{});class g{constructor(e,t,a,r,i=0,c=0){s(this,"id");s(this,"type");s(this,"name");s(this,"description");s(this,"baseHealth");s(this,"baseDamage");s(this,"groupCount");this.id=e,this.type=t,this.name=a,this.description=r,this.baseHealth=i,this.baseDamage=c,this.groupCount=1}getHealth(){return this.type!=="enemy"?0:this.groupCount===1?this.baseHealth:this.groupCount===2?Math.floor(this.baseHealth*1.5):Math.floor(this.baseHealth*2)}getDamage(){return this.type!=="enemy"?0:this.groupCount===1?this.baseDamage:this.baseDamage+(this.groupCount-1)}getTrapDamagePenalty(){return this.type!=="trap"?0:this.groupCount===1?1:this.groupCount===2?2:999}merge(e){this.type!==e.type||this.name!==e.name||(this.groupCount+=e.groupCount)}clone(){const e=new g(this.id,this.type,this.name,this.description,this.baseHealth,this.baseDamage);return e.groupCount=this.groupCount,e}}class z{constructor(e){s(this,"gameState");this.gameState=e}endPlayerTurn(){const e=this.gameState.advanceAllCards();if(this.processCollisions(e),!this.gameState.character.isAlive()){this.gameState.endGame("character_defeated");return}this.gameState.nextTurn()}processCollisions(e){const t=this.gameState.character;for(const a of e)switch(a.type){case o.ENEMY:const r=a.getDamage();t.takeDamage(r);break;case o.TRAP:const i=a.getTrapDamagePenalty();t.takeDamage(i),i>=999&&this.gameState.endGame("instant_death_trap");break;case o.TREASURE:const c=`${a.name} (Treasure)`;t.addItem(c);break}}reset(){this.gameState.reset()}}class D{constructor(e="game-board"){s(this,"boardElement");const t=document.getElementById(e);if(!t)throw new Error(`Container ${e} not found`);this.boardElement=t}render(e){this.boardElement.innerHTML=`
      <div class="game-container">
        <div class="game-info">
          <div class="turn-counter">Turn: ${e.currentTurn}</div>
          <div class="player-health">
            <span class="health-label">Health:</span>
            <span class="health-value">${e.character.health}/${e.character.maxHealth}</span>
          </div>
        </div>

        <div class="game-board">
          ${e.lanes.map((t,a)=>this.renderLane(t,a)).join("")}
          <div class="player-area">
            <div class="player-card">⚔️</div>
          </div>
        </div>

        <div class="inventory">
          <div class="inventory-label">Items (${e.character.items.length})</div>
          <div class="item-list">
            ${e.character.items.map((t,a)=>`<div class="item" data-index="${a}">${t}</div>`).join("")}
          </div>
        </div>
      </div>
    `,this.addStyles()}renderLane(e,t){const r=e.cards.map((i,c)=>i?this.renderCard(i,t,c):'<div class="card-slot empty"></div>').join("");return`
      <div class="lane" data-lane-index="${t}">
        <div class="cards-container">
          ${r}
        </div>
      </div>
    `}renderCard(e,t,a){const r=e.type,i=this.getCardColor(e.type),c=this.getCardStats(e);return`
      <div
        class="card-slot card ${r}"
        data-lane="${t}"
        data-distance="${a}"
        data-card-id="${e.id}"
        style="background-color: ${i};"
      >
        <div class="card-name">${e.name}</div>
        ${c}
        ${e.groupCount>1?`<div class="card-group">x${e.groupCount}</div>`:""}
      </div>
    `}getCardColor(e){switch(e){case o.ENEMY:return"#8b3a3a";case o.TRAP:return"#4a3a2a";case o.TREASURE:return"#6b5a2a";default:return"#3a4a5a"}}getCardStats(e){return e.type===o.ENEMY?`
        <div class="card-stats">
          <span class="stat health">❤️ ${e.getHealth()}</span>
          <span class="stat damage">⚔️ ${e.getDamage()}</span>
        </div>
      `:""}addStyles(){if(document.getElementById("game-board-styles"))return;const e=document.createElement("style");e.id="game-board-styles",e.textContent=`
      .game-container {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100vh;
        background-color: var(--color-bg-primary);
        color: var(--color-text-primary);
        font-family: 'Courier New', monospace;
      }

      .game-info {
        padding: 16px 24px;
        border-bottom: 1px solid var(--color-card-border);
        display: flex;
        gap: 32px;
        font-size: var(--font-size-base);
      }

      .turn-counter, .player-health {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .health-value {
        font-weight: bold;
        color: #ff8c42;
      }

      .game-board {
        flex: 1;
        display: grid;
        grid-template-columns: 1fr 80px;
        gap: 24px;
        padding: 24px;
        overflow-y: auto;
      }

      .game-board > div:not(.player-area) {
        display: flex;
      }

      .lane {
        flex: 1;
        border: 1px solid var(--color-card-border);
        border-radius: 8px;
        padding: 12px;
        background-color: var(--color-bg-secondary);
      }

      .cards-container {
        display: grid;
        grid-template-rows: repeat(4, 1fr);
        gap: 8px;
        height: 100%;
      }

      .card-slot {
        padding: 12px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        background-color: var(--color-card-bg);
        min-height: 80px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
        position: relative;
        font-size: var(--font-size-sm);
      }

      .card-slot.empty {
        background-color: transparent;
        border: 1px dashed rgba(255, 255, 255, 0.1);
      }

      .card-name {
        font-weight: bold;
        margin-bottom: 4px;
        font-size: var(--font-size-base);
      }

      .card-stats {
        display: flex;
        gap: 8px;
        font-size: var(--font-size-sm);
      }

      .stat {
        display: flex;
        align-items: center;
        gap: 2px;
      }

      .card-group {
        position: absolute;
        top: 4px;
        right: 4px;
        background-color: rgba(0, 0, 0, 0.5);
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: bold;
      }

      .player-area {
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid #f4a460;
        border-radius: 8px;
        background-color: var(--color-bg-secondary);
        padding: 12px;
      }

      .player-card {
        font-size: 48px;
      }

      .inventory {
        border-top: 1px solid var(--color-card-border);
        padding: 16px 24px;
        background-color: var(--color-bg-secondary);
      }

      .inventory-label {
        font-size: var(--font-size-base);
        font-weight: bold;
        margin-bottom: 8px;
      }

      .item-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .item {
        background-color: var(--color-card-bg);
        padding: 6px 12px;
        border-radius: 4px;
        border: 1px solid var(--color-card-border);
        font-size: var(--font-size-sm);
        cursor: pointer;
        transition: all 0.2s;
      }

      .item:hover {
        background-color: #3a5a7a;
      }

      .card.enemy {
        border: 2px solid #ff8c42;
      }

      .card.trap {
        border: 2px solid #ff6b6b;
      }

      .card.treasure {
        border: 2px solid #ffd700;
      }
    `,document.head.appendChild(e)}}class C{static generateDrop(){const e=Math.random()*100;return e<40?this.ITEM_POOL[0]:e<70?this.ITEM_POOL[1]:e<90?this.ITEM_POOL[2]:this.ITEM_POOL[3]}static applyItem(e,t){switch(e.effect){case"heal-small":t("heal",1);break;case"heal-large":t("heal",2);break;case"damage-boost":t("damage-boost",1);break;case"defense-boost":t("defense-boost",1);break}}}s(C,"ITEM_POOL",[{name:"Health Potion",description:"+1 Health",effect:"heal-small"},{name:"Large Potion",description:"+2 Health",effect:"heal-large"},{name:"Attack Boost",description:"+1 Attack (1 turn)",effect:"damage-boost"},{name:"Defense Boost",description:"-1 Damage (1 turn)",effect:"defense-boost"}]);var u=(n=>(n.ATTACK_ENEMY="attack",n.EVADE_TRAP="evade",n.TAKE_TREASURE="take",n))(u||{});class L{static executeAction(e,t,a,r){if(!a)return{success:!1,message:"No card selected",cardRemoved:!1};switch(r){case"attack":return this.attackEnemy(e,t,a);case"evade":return this.evadeTrap(t,a);case"take":return this.takeTreasure(e,t,a);default:return{success:!1,message:"Invalid action",cardRemoved:!1}}}static attackEnemy(e,t,a){if(a.type!==o.ENEMY)return{success:!1,message:"Not an enemy",cardRemoved:!1};const r=e.damage,i=a.getHealth()-r;if(i<=0){t.removeCard(a);const f=C.generateDrop();return e.addItem(f.name),{success:!0,message:`Defeated ${a.name}! Got ${f.name}`,damageDealt:r,itemGained:f.name,cardRemoved:!0}}a.baseHealth=i;const c=a.getDamage(),v=e.takeDamage(c);return{success:!0,message:`Hit ${a.name} for ${r}. Took ${v} damage`,damageDealt:r,damageTaken:v,cardRemoved:!1}}static evadeTrap(e,t){return t.type!==o.TRAP?{success:!1,message:"Not a trap",cardRemoved:!1}:(e.removeCard(t),{success:!0,message:`Evaded trap: ${t.name}`,cardRemoved:!0})}static takeTreasure(e,t,a){if(a.type!==o.TREASURE)return{success:!1,message:"Not a treasure",cardRemoved:!1};const r=`${a.name} (Treasure)`;return e.addItem(r),t.removeCard(a),{success:!0,message:`Got treasure: ${r}`,itemGained:r,cardRemoved:!0}}}class N{constructor(e="action-ui"){s(this,"containerElement");s(this,"onActionCallback",null);s(this,"currentCard",null);s(this,"currentLane",null);const t=document.getElementById(e);if(!t)throw new Error(`Container ${e} not found`);this.containerElement=t}showActions(e,t){this.currentCard=t,this.currentLane=e;const a=this.getAvailableActions(t);this.render(t,a)}hideActions(){this.containerElement.innerHTML="",this.currentCard=null,this.currentLane=null}onAction(e){this.onActionCallback=e}getAvailableActions(e){switch(e.type){case o.ENEMY:return[u.ATTACK_ENEMY];case o.TRAP:return[u.EVADE_TRAP];case o.TREASURE:return[u.TAKE_TREASURE];default:return[]}}render(e,t){const a=t.map(r=>this.getActionButton(r,e)).join("");this.containerElement.innerHTML=`
      <div class="action-panel">
        <div class="action-card-info">
          <div class="action-card-name">${e.name}</div>
          <div class="action-card-desc">${e.description}</div>
        </div>
        <div class="action-buttons">
          ${a}
          <button class="action-btn cancel-btn" data-action="cancel">Cancel</button>
        </div>
      </div>
    `,this.addStyles(),this.attachEventListeners(t)}getActionButton(e,t){const a={[u.ATTACK_ENEMY]:"⚔️ Attack",[u.EVADE_TRAP]:"🏃 Evade",[u.TAKE_TREASURE]:"💰 Take"};return`<button class="action-btn" data-action="${e}">${a[e]}</button>`}attachEventListeners(e){for(const a of e){const r=this.containerElement.querySelector(`[data-action="${a}"]`);r&&r.addEventListener("click",()=>{this.onActionCallback&&this.currentCard&&this.currentLane!==null&&(this.onActionCallback(this.currentLane,this.currentCard,a),this.hideActions())})}const t=this.containerElement.querySelector('[data-action="cancel"]');t&&t.addEventListener("click",()=>this.hideActions())}addStyles(){if(document.getElementById("action-ui-styles"))return;const e=document.createElement("style");e.id="action-ui-styles",e.textContent=`
      .action-panel {
        background-color: var(--color-bg-secondary);
        border: 2px solid #f4a460;
        border-radius: 8px;
        padding: 16px;
        margin: 16px;
      }

      .action-card-info {
        margin-bottom: 12px;
      }

      .action-card-name {
        font-size: var(--font-size-lg);
        font-weight: bold;
        color: #f4a460;
        margin-bottom: 4px;
      }

      .action-card-desc {
        font-size: var(--font-size-sm);
        color: #ccc;
      }

      .action-buttons {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .action-btn {
        flex: 1;
        min-width: 80px;
        padding: 10px 16px;
        background-color: #2a3d5a;
        border: 1px solid #f4a460;
        color: var(--color-text-primary);
        border-radius: 4px;
        cursor: pointer;
        font-size: var(--font-size-base);
        font-weight: bold;
        transition: all 0.2s;
      }

      .action-btn:hover {
        background-color: #3a5d7a;
        border-color: #ff8c42;
      }

      .action-btn:active {
        transform: scale(0.98);
      }

      .cancel-btn {
        background-color: #3a2a2a;
        border-color: #666;
        flex: 1;
      }

      .cancel-btn:hover {
        background-color: #5a3a3a;
        border-color: #999;
      }
    `,document.head.appendChild(e)}}const y=["Ink Wolf","Candle Rabbit","Raven","Wax Deer","Lost Child","Shadow"],x=["Black Rain","Dark Lantern","Muddy Path","Torn Road","Dying Flame"],E=["Treasure Box","Glowing Chest","Golden Coffer","Shiny Box"];class H{constructor(){s(this,"turnCount",0)}spawnCardsForTurn(){this.turnCount++;const e=[];for(let t=0;t<3;t++)e.push(this.generateRandomCard());return e}generateRandomCard(){const e=Math.random();return e<.5?this.generateEnemy():e<.75?this.generateTrap():this.generateTreasure()}generateEnemy(){const e=y[Math.floor(Math.random()*y.length)],t=3+Math.floor(Math.random()*3),a=1+Math.floor(Math.random()*2);return new g(`enemy-${this.turnCount}-${Math.random()}`,o.ENEMY,e,"Attacks the player",t,a)}generateTrap(){const e=x[Math.floor(Math.random()*x.length)];return new g(`trap-${this.turnCount}-${Math.random()}`,o.TRAP,e,"Blocks the lane")}generateTreasure(){const e=E[Math.floor(Math.random()*E.length)];return new g(`treasure-${this.turnCount}-${Math.random()}`,o.TREASURE,e,"Provides rewards")}}class p{static defineFont(e,t){const a={...t,size:Math.max(t.size,this.MIN_FONT_SIZE)};this.fonts.set(e,a)}static getFont(e){return this.fonts.get(e)}static validateSize(e){return Math.max(e,this.MIN_FONT_SIZE)}static applyToElement(e,t){const a=this.fonts.get(t);if(!a){console.warn(`Font "${t}" not found`);return}this.applyConfig(e,a)}static applyConfig(e,t){const a=this.validateSize(t.size);e.style.fontFamily=t.family,e.style.fontSize=`${a}px`,t.weight&&(e.style.fontWeight=t.weight.toString()),t.lineHeight&&(e.style.lineHeight=t.lineHeight.toString())}static getGlobalStyles(){return{"--font-size-base":`${this.validateSize(14)}px`,"--font-size-sm":`${this.validateSize(12)}px`,"--font-size-lg":`${this.validateSize(18)}px`,"--font-size-xl":`${this.validateSize(24)}px`}}static initializeDefaults(){this.defineFont("body",{family:"-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Courier New', monospace",size:14,lineHeight:1.6}),this.defineFont("ui-small",{family:"'Courier New', monospace",size:12,weight:400}),this.defineFont("ui-normal",{family:"'Courier New', monospace",size:14,weight:400}),this.defineFont("ui-large",{family:"'Courier New', monospace",size:18,weight:600}),this.defineFont("card-title",{family:"'Courier New', monospace",size:16,weight:700,lineHeight:1.4}),this.defineFont("card-description",{family:"'Courier New', monospace",size:12,weight:400,lineHeight:1.5})}static listFonts(){return Array.from(this.fonts.keys())}}s(p,"MIN_FONT_SIZE",12),s(p,"fonts",new Map);p.initializeDefaults();console.log("🕯️ Unmelting Game Starting...");const l=new R,I=new z(l),T=new H,O=new D("app"),A=new N("app");let h=!0;const P=document.getElementById("app");P.innerHTML=`
  <div id="game-board" style="flex: 1;"></div>
  <div id="action-ui" style="position: fixed; bottom: 0; left: 0; right: 0; background: var(--color-bg-primary);"></div>
  <div id="turn-button-panel" style="position: fixed; bottom: 100px; right: 24px; z-index: 100;"></div>
`;p.initializeDefaults();function b(){h=!0,l.reset(),_(),w()}function _(){const n=T.spawnCardsForTurn();for(let e=0;e<3;e++){const t=l.getLane(e),a=n[e];a&&!t.addCardAtDistance(3,a)&&console.warn(`Could not add card to lane ${e}`)}}function B(){const n=T.spawnCardsForTurn();for(let e=0;e<3;e++){const t=l.getLane(e),a=n[e];a&&!t.addCardAtDistance(3,a)&&console.warn(`Could not add card to lane ${e}`)}}function w(){O.render(l),G(),U()}function G(){document.querySelectorAll(".card-slot.card").forEach(e=>{e.addEventListener("click",t=>{t.preventDefault();const a=parseInt(e.dataset.lane||"0"),r=parseInt(e.dataset.distance||"0"),c=l.getLane(a).getCardAtDistance(r);c&&h&&A.showActions(a,c)})})}A.onAction((n,e,t)=>{if(!h)return;const a=l.getLane(n),r=L.executeAction(l.character,a,e,t);console.log(`${r.message}`),setTimeout(()=>{F()},300)});function F(){if(h){if(I.endPlayerTurn(),l.isGameOver){h=!1,console.log(`Game Over: ${l.gameOverReason}`),Y();return}B(),w()}}function U(){const n=document.getElementById("turn-button-panel");if(h)n.innerHTML=`
      <div style="text-align: right; color: #f4a460; font-size: var(--font-size-base); margin-bottom: 8px;">
        Click a card to act
      </div>
    `;else{n.innerHTML=`
      <button id="restart-btn" class="turn-btn">Start New Game</button>
    `;const e=document.getElementById("restart-btn");e&&e.addEventListener("click",b)}}function Y(){const n=document.createElement("div");n.style.cssText=`
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  `;const e=document.createElement("div");e.style.cssText=`
    background: var(--color-bg-secondary);
    padding: 32px;
    border-radius: 8px;
    text-align: center;
    border: 2px solid #f4a460;
  `;const t=l.gameOverReason==="character_defeated"?"You were defeated!":"Game Over!",a=l.currentTurn;e.innerHTML=`
    <h1 style="font-size: 32px; color: #f4a460; margin-bottom: 16px;">💀 ${t}</h1>
    <p style="font-size: 18px; margin-bottom: 24px;">Survived ${a} turns</p>
    <button id="game-over-restart" class="turn-btn" style="padding: 12px 24px; font-size: 16px;">Play Again</button>
  `,n.appendChild(e),document.body.appendChild(n);const r=document.getElementById("game-over-restart");r&&r.addEventListener("click",()=>{n.remove(),b()})}const k=document.createElement("style");k.textContent=`
  .turn-btn {
    padding: 12px 24px;
    background-color: #2a3d5a;
    border: 2px solid #f4a460;
    color: var(--color-text-primary);
    border-radius: 4px;
    cursor: pointer;
    font-size: var(--font-size-base);
    font-weight: bold;
    transition: all 0.2s;
  }

  .turn-btn:hover {
    background-color: #3a5d7a;
    border-color: #ff8c42;
    transform: scale(1.05);
  }

  .turn-btn:active {
    transform: scale(0.98);
  }
`;document.head.appendChild(k);b();
