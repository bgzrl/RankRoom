import {
  ALL_TIERS,
  groupResultsByTier,
  type PersistedGameResult,
  type RankedItemResult,
  type Tier,
} from '@rankroom/shared';

const TIER_COLORS: Record<Tier, { bg: string; text: string }> = {
  S: { bg: '#b91c1c', text: '#ffffff' },
  A: { bg: '#c2410c', text: '#ffffff' },
  B: { bg: '#b45309', text: '#ffffff' },
  C: { bg: '#15803d', text: '#ffffff' },
  D: { bg: '#3f3f46', text: '#ffffff' },
};

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  if (!src) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    let settled = false;

    const finish = (value: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const timer = window.setTimeout(() => finish(null), 5000);
    img.onload = () => {
      window.clearTimeout(timer);
      finish(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      finish(null);
    };
    img.src = src;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}…`;
}

export async function exportTierListToPng(
  result: PersistedGameResult,
  darkMode: boolean,
): Promise<void> {
  const { tiers, unranked } = groupResultsByTier(result.rankings);

  const imageMap = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    result.rankings.map(async (item) => {
      const img = await loadImageElement(item.imagePath);
      imageMap.set(item.itemId, img);
    }),
  );

  const logicalWidth = 1280;
  const paddingX = 40;
  const headerHeight = 108;
  const tierLabelWidth = 96;
  const cardWidth = 148;
  const cardHeight = 136;
  const cardGap = 12;
  const rowPadY = 14;
  const rowGap = 10;
  const footerHeight = 44;

  const contentAreaWidth = logicalWidth - paddingX * 2 - tierLabelWidth - 28;
  const cardsPerRow = Math.max(1, Math.floor((contentAreaWidth + cardGap) / (cardWidth + cardGap)));

  const rows: Array<{
    key: string;
    label: string;
    bg: string;
    text: string;
    items: RankedItemResult[];
    height: number;
  }> = [];

  for (const tier of ALL_TIERS) {
    const items = tiers[tier];
    const lineCount = Math.max(1, Math.ceil(items.length / cardsPerRow));
    const height = Math.max(120, rowPadY * 2 + lineCount * cardHeight + (lineCount - 1) * cardGap);
    rows.push({
      key: tier,
      label: tier,
      bg: TIER_COLORS[tier].bg,
      text: TIER_COLORS[tier].text,
      items,
      height,
    });
  }

  if (unranked.length > 0) {
    const lineCount = Math.max(1, Math.ceil(unranked.length / cardsPerRow));
    const height = Math.max(110, rowPadY * 2 + lineCount * cardHeight + (lineCount - 1) * cardGap);
    rows.push({
      key: 'UNRANKED',
      label: '—',
      bg: '#52525b',
      text: '#ffffff',
      items: unranked,
      height,
    });
  }

  const totalRowsHeight =
    rows.reduce((sum, r) => sum + r.height, 0) + Math.max(0, rows.length - 1) * rowGap;
  const logicalHeight = headerHeight + totalRowsHeight + footerHeight + 24;

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = logicalWidth * scale;
  canvas.height = logicalHeight * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error("Impossible d'initialiser le contexte Canvas 2D.");
  }

  ctx.scale(scale, scale);

  const palette = darkMode
    ? {
        canvasBg: '#09090b',
        rowBg: '#111114',
        cardBg: '#18181b',
        border: '#27272a',
        title: '#f4f4f5',
        muted: '#a1a1aa',
        thumbBg: '#27272a',
      }
    : {
        canvasBg: '#fafafa',
        rowBg: '#ffffff',
        cardBg: '#f4f4f5',
        border: '#e4e4e7',
        title: '#18181b',
        muted: '#71717a',
        thumbBg: '#e4e4e7',
      };

  // Background
  ctx.fillStyle = palette.canvasBg;
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);

  // Header
  ctx.fillStyle = palette.title;
  ctx.font = '700 28px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(truncateText(ctx, result.themeTitle, logicalWidth - paddingX * 2 - 220), paddingX, 28);

  const dateStr = new Date(result.createdAt).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const scaleLabel = result.settings.ratingScale === 'half_stars' ? 'Demi-étoiles' : 'Entiers 1–5';
  const subtitle = `${result.themeCategory} · ${result.players.length} participant${result.players.length > 1 ? 's' : ''} · ${scaleLabel} · ${dateStr}`;
  ctx.fillStyle = palette.muted;
  ctx.font = '500 14px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
  ctx.fillText(subtitle, paddingX, 66);

  // Brand mark right
  ctx.textAlign = 'right';
  ctx.fillStyle = palette.muted;
  ctx.font = '600 14px "JetBrains Mono", monospace';
  ctx.fillText(`RankRoom · ${result.roomCode}`, logicalWidth - paddingX, 34);
  ctx.textAlign = 'left';

  let cursorY = headerHeight;

  for (const row of rows) {
    const rowX = paddingX;
    const rowWidth = logicalWidth - paddingX * 2;

    // Row container
    drawRoundedRect(ctx, rowX, cursorY, rowWidth, row.height, 10);
    ctx.fillStyle = palette.rowBg;
    ctx.fill();
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Tier label cell
    ctx.save();
    drawRoundedRect(ctx, rowX, cursorY, tierLabelWidth, row.height, 10);
    ctx.clip();
    ctx.fillStyle = row.bg;
    ctx.fillRect(rowX, cursorY, tierLabelWidth, row.height);
    ctx.restore();

    ctx.fillStyle = row.text;
    ctx.font = '700 30px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(row.label, rowX + tierLabelWidth / 2, cursorY + row.height / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    if (row.items.length === 0) {
      ctx.fillStyle = palette.muted;
      ctx.font = '500 13px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('Aucun item dans ce palier', rowX + tierLabelWidth + 20, cursorY + row.height / 2);
      ctx.textBaseline = 'top';
    } else {
      row.items.forEach((item, idx) => {
        const col = idx % cardsPerRow;
        const line = Math.floor(idx / cardsPerRow);
        const cardX = rowX + tierLabelWidth + 14 + col * (cardWidth + cardGap);
        const cardY = cursorY + rowPadY + line * (cardHeight + cardGap);

        drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 8);
        ctx.fillStyle = palette.cardBg;
        ctx.fill();
        ctx.strokeStyle = palette.border;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Thumbnail
        const thumbH = 84;
        ctx.save();
        drawRoundedRect(ctx, cardX + 6, cardY + 6, cardWidth - 12, thumbH, 6);
        ctx.clip();
        ctx.fillStyle = palette.thumbBg;
        ctx.fillRect(cardX + 6, cardY + 6, cardWidth - 12, thumbH);

        const img = imageMap.get(item.itemId) ?? null;
        if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
          const boxW = cardWidth - 12;
          const boxH = thumbH;
          const ratio = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight);
          const drawW = img.naturalWidth * ratio;
          const drawH = img.naturalHeight * ratio;
          const dx = cardX + 6 + (boxW - drawW) / 2;
          const dy = cardY + 6 + (boxH - drawH) / 2;
          ctx.drawImage(img, dx, dy, drawW, drawH);
        } else {
          ctx.fillStyle = palette.muted;
          ctx.font = '600 18px "Plus Jakarta Sans", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(item.name.slice(0, 2).toUpperCase(), cardX + cardWidth / 2, cardY + 6 + thumbH / 2);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
        }
        ctx.restore();

        // Item name & average score
        ctx.fillStyle = palette.title;
        ctx.font = '600 12px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillText(truncateText(ctx, item.name, cardWidth - 14), cardX + 7, cardY + 96);

        ctx.fillStyle = palette.muted;
        ctx.font = '500 11px "JetBrains Mono", monospace';
        const scoreLabel =
          item.averageScore !== null ? `${item.averageScore.toFixed(2)} / 5` : 'Non noté';
        ctx.fillText(`#${item.rank} · ${scoreLabel}`, cardX + 7, cardY + 114);
      });
    }

    cursorY += row.height + rowGap;
  }

  // Trigger download
  const dataUrl = canvas.toDataURL('image/png');
  const slug = result.themeTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `rankroom-${slug || 'tierlist'}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
