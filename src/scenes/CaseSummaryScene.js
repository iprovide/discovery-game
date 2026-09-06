import Phaser from 'phaser';
import { drawTitle, drawSubtitle, drawPanel, drawButton, drawMoneyBadge, palette, font } from './sceneHelpers.js';
import {
  currentCase,
  getMoney,
  getResult,
  commitResult,
  retryCase,
  advanceCase,
  hasNextCase
} from '../systems/gameState.js';
import { requestToSentence } from '../systems/scanEngine.js';

// The post-mortem. This screen is where the lesson lands: it separates value
// you never retrieved, value you retrieved but had no hours to read, and
// value you read past. Those are three different mistakes with three
// different fixes, and the player should be able to tell them apart.
export default class CaseSummaryScene extends Phaser.Scene {
  constructor() {
    super('CaseSummary');
  }

  create() {
    const caseData = currentCase();
    const result = getResult();
    this.cameras.main.setBackgroundColor(palette.bg);

    if (!result.committed) {
      commitResult(result);
      result.committed = true;
    }

    const s = result.stats;
    const cleared = result.net >= caseData.moneyThreshold;
    const neverRetrieved = s.totalAvailable - s.retrievedValue;

    drawMoneyBadge(this, getMoney());
    drawTitle(this, cleared ? 'Case Closed' : 'Short of the Mark', 44);
    drawSubtitle(
      this,
      cleared
        ? `You cleared the $${caseData.moneyThreshold.toLocaleString()} threshold.`
        : `You needed $${caseData.moneyThreshold.toLocaleString()} from this case. You got $${result.net.toLocaleString()}.`,
      74
    );

    // The request as filed
    drawPanel(this, 40, 100, 880, 62);
    this.add
      .text(58, 110, 'FILED', { fontFamily: font, fontSize: '11px', color: palette.dim })
      .setOrigin(0, 0);
    this.add
      .text(58, 126, requestToSentence(caseData, result.request), {
        fontFamily: font,
        fontSize: '14px',
        color: palette.text,
        fontStyle: 'italic',
        wordWrap: { width: 844 }
      })
      .setOrigin(0, 0);

    // Ledger
    drawPanel(this, 40, 176, 430, 216);
    this.line(58, 190, 'THE LEDGER', palette.dim, '11px');
    const rows = [
      [
        `${s.capturedZones} discover${s.capturedZones === 1 ? 'y' : 'ies'}`,
        `+$${result.gross.toLocaleString()}`,
        palette.gold
      ],
      [`Labor (${result.labor.tier.label})`, `-$${result.laborCost.toLocaleString()}`, palette.danger],
      result.productionCost
        ? ['Extra productions', `-$${result.productionCost.toLocaleString()}`, palette.danger]
        : ['', '', null],
      ['', '', null],
      ['Net for this case', `$${result.net.toLocaleString()}`, cleared ? palette.accent : palette.danger]
    ];
    rows.forEach(([label, value, color], i) => {
      if (!label) return;
      const y = 214 + i * 28;
      this.line(58, y, label, palette.text, '15px');
      this.add
        .text(450, y, value, { fontFamily: font, fontSize: '15px', color })
        .setOrigin(1, 0);
    });
    this.add.rectangle(58, 302, 392, 1, 0x39425a).setOrigin(0, 0);

    // What got away
    drawPanel(this, 490, 176, 430, 216);
    this.line(508, 190, 'WHAT GOT AWAY', palette.dim, '11px');
    // Four buckets, because "you were reading for the wrong kind of thing" is
    // a different lesson from "you read for the right thing and got unlucky",
    // and the player can only act on the difference if we show it.
    const misses = [
      [`Never requested`, neverRetrieved, 'documents your scope never touched'],
      [
        `Left on the cart`,
        s.missedUnread,
        `${s.unreadCount} document${s.unreadCount === 1 ? '' : 's'} you never packed`
      ],
      [
        `Wrong kind of reading`,
        s.missedWrongKind,
        'open on the desk, but you were not reading for that kind'
      ],
      [`Read, missed`, s.missedInAssigned, 'the right kind of thing, and still slipped past']
    ];
    misses.forEach(([label, value, note], i) => {
      const y = 212 + i * 44;
      this.line(508, y, label, palette.text, '15px');
      this.add
        .text(900, y, `$${value.toLocaleString()}`, { fontFamily: font, fontSize: '15px', color: palette.dim })
        .setOrigin(1, 0);
      this.add
        .text(508, y + 19, note, { fontFamily: font, fontSize: '11px', color: palette.dim })
        .setOrigin(0, 0);
    });

    this.add
      .text(this.scale.width / 2, 400, this.verdict(result, caseData, cleared).headline, {
        fontFamily: font,
        fontSize: '16px',
        color: palette.text,
        align: 'center',
        wordWrap: { width: 820 }
      })
      .setOrigin(0.5, 0);

    this.add
      .text(this.scale.width / 2, 424, this.verdict(result, caseData, cleared).tip, {
        fontFamily: font,
        fontSize: '14px',
        color: palette.gold,
        align: 'center',
        wordWrap: { width: 820 }
      })
      .setOrigin(0.5, 0);

    drawButton(this, 'Re-file with a new request ↻', 470, () => {
      retryCase();
      this.scene.start('RequestBuilder');
    }, { x: 300, width: 320, height: 42, fontSize: '16px' });

    drawButton(
      this,
      hasNextCase() ? 'Next case ▶' : 'Cases 2–3 coming in Phase 9',
      470,
      () => {
        if (!hasNextCase()) return;
        advanceCase();
        this.scene.start('FactPattern');
      },
      { x: 660, width: 320, height: 42, fontSize: '16px', color: hasNextCase() ? palette.text : palette.dim }
    );
  }

  line(x, y, text, color, size) {
    return this.add.text(x, y, text, { fontFamily: font, fontSize: size, color }).setOrigin(0, 0);
  }

  // One sentence of diagnosis, pointed at whichever mistake cost the most.
  // Coaching, not just commentary. The post-mortem is now where the teaching
  // happens — the request builder deliberately predicts nothing — so this names
  // the single biggest thing that went wrong and says what to do about it.
  // Ordered by how actionable the fix is, not by dollar size: a player who was
  // reading for the wrong kind of thing should hear that before they hear about
  // scope, because it's a one-click fix and scope is a re-draft.
  verdict(result, caseData, cleared) {
    const s = result.stats;
    const neverRetrieved = s.totalAvailable - s.retrievedValue;
    const style = result.labor.style;
    const buckets = [
      ['wrongKind', s.missedWrongKind],
      ['unread', s.missedUnread],
      ['missed', s.missedInAssigned],
      ['never', neverRetrieved]
    ];
    buckets.sort((a, b) => b[1] - a[1]);
    let [worstId, worstValue] = buckets[0];
    // Actionability beats raw size for one case: reading for the wrong kind is
    // a one-click fix, where scope is a re-draft. If it's close to the top, say
    // that first.
    const wrongKind = s.missedWrongKind;
    if (worstId !== 'wrongKind' && wrongKind > 0 && wrongKind >= worstValue * 0.6) {
      worstId = 'wrongKind';
      worstValue = wrongKind;
    }

    if (worstValue === 0) {
      return {
        headline: 'You got everything there was to get.',
        tip: 'Somewhere, a turtle is sweating.'
      };
    }

    const money = `$${worstValue.toLocaleString()}`;
    switch (worstId) {
      case 'wrongKind':
        return {
          headline: `${money} was sitting open on a desk and nobody registered it.`,
          tip: `${style.label} only picks up ${(style.catches || []).map((k) => `${k}s`).join(' and ')}. Try a different reading style — the case decides which one, not your budget.`
        };
      case 'unread':
        return {
          headline: `You never got to ${money} of what you asked for.`,
          tip: `${s.unreadCount} document${s.unreadCount === 1 ? '' : 's'} never made it into the box. Buy a bigger box, pack it tighter, or ask for less.`
        };
      case 'missed':
        return {
          headline: `${money} was in a document you read, and still slipped past.`,
          tip: 'The right documents came back bloated. Every extra specifier shortens the file your associates have to wade through.'
        };
      default:
        return {
          headline: cleared
            ? `You found enough — but ${money} was outside your scope entirely.`
            : `${money} never made it into the box at all.`,
          tip: 'That value was never responsive to what you asked for. Widen a field, or find a specifier that points somewhere new.'
        };
    }
  }
}
