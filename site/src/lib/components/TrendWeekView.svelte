<script lang="ts">
	import { base } from '$app/paths';
	import { goto, replaceState } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import Icon from '@iconify/svelte';
	import { getStoredToken } from '$lib/auth';
	import { fetchMarks, addMark, removeMark } from '$lib/marks';
	import {
		adjacentWeeks,
		groupWeek,
		trendWeeks,
		weekItemCount,
		type TrendWeek,
		type WeekArticle
	} from '$lib/trends';

	let { week }: { week: TrendWeek } = $props();

	const TOP = 'トップ';
	const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

	const groups = $derived(groupWeek(week));
	const tabs = $derived([TOP, ...groups.map((g) => g.name)]);
	const adjacent = $derived(adjacentWeeks(week.start));

	let active = $state(TOP);
	// 週を移動して、選択中の大分類がその日に無ければトップに戻す
	const current = $derived(tabs.includes(active) ? active : TOP);
	const currentGroup = $derived(groups.find((g) => g.name === current));

	let tabBar: HTMLElement | undefined = $state();
	let tabButtons: Record<string, HTMLElement> = {};

	let token = $state('');
	let marked = $state<Set<string>>(new Set());
	let pending = $state<Set<string>>(new Set());

	onMount(() => {
		token = getStoredToken();
		const fromHash = decodeURIComponent(location.hash.slice(1));
		if (fromHash) {
			active = fromHash;
			tick().then(() => tabButtons[current]?.scrollIntoView({ inline: 'center', block: 'nearest' }));
		}
	});

	$effect(() => {
		const start = week.start;
		marked = new Set();
		Promise.all(week.days.map((d) => fetchMarks(d.date))).then((sets) => {
			if (start === week.start) marked = new Set(sets.flatMap((s) => [...s]));
		});
	});

	function formatDate(date: string, withYear = false) {
		const [y, m, d] = date.split('-').map(Number);
		const w = WEEKDAYS[new Date(y, m - 1, d).getDay()];
		return `${withYear ? `${y}年` : ''}${m}月${d}日(${w})`;
	}

	function formatWeek(w: TrendWeek) {
		return `${formatDate(w.start, true)}〜${formatDate(w.end)}`;
	}

	function hashFor(tab: string) {
		return tab === TOP ? '' : `#${encodeURIComponent(tab)}`;
	}

	async function selectTab(tab: string) {
		if (tab === current) return;
		active = tab;
		replaceState(hashFor(tab) || location.pathname, {});
		await tick();
		tabButtons[tab]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
		// タブバーより下までスクロールしていたら、記事の先頭に戻す
		if (tabBar && window.scrollY > tabBar.offsetTop) {
			window.scrollTo({ top: tabBar.offsetTop });
		}
	}

	// スマホでは左右スワイプでタブを切り替える
	let touchStart: { x: number; y: number } | null = null;

	function onTouchStart(e: TouchEvent) {
		const t = e.touches[0];
		touchStart = { x: t.clientX, y: t.clientY };
	}

	function onTouchEnd(e: TouchEvent) {
		if (!touchStart) return;
		const t = e.changedTouches[0];
		const dx = t.clientX - touchStart.x;
		const dy = t.clientY - touchStart.y;
		touchStart = null;
		if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
		const next = tabs.indexOf(current) + (dx < 0 ? 1 : -1);
		if (next >= 0 && next < tabs.length) selectTab(tabs[next]);
	}

	async function toggleMark(date: string, url: string, titleJa: string) {
		if (!token || pending.has(url)) return;
		const wasMarked = marked.has(url);
		const next = new Set(marked);
		wasMarked ? next.delete(url) : next.add(url);
		marked = next;
		pending = new Set(pending).add(url);
		try {
			if (wasMarked) {
				await removeMark(token, date, url);
			} else {
				await addMark(token, date, url, titleJa);
			}
		} catch {
			// revert on failure
			const reverted = new Set(marked);
			wasMarked ? reverted.add(url) : reverted.delete(url);
			marked = reverted;
		} finally {
			const cleared = new Set(pending);
			cleared.delete(url);
			pending = cleared;
		}
	}
</script>

{#snippet article({ item, date, label }: WeekArticle, lead: boolean)}
	<article class="flex items-start gap-2 py-4">
		<div class="min-w-0 flex-1">
			{#if label}
				<p class="text-primary mb-1 text-xs font-semibold">{label}</p>
			{/if}
			<a
				href={item.url}
				target="_blank"
				rel="noopener noreferrer"
				class="link-hover block font-serif leading-snug font-bold {lead ? 'text-xl' : 'text-base'}"
			>
				{item.title_ja}
				<Icon icon="mdi:open-in-new" class="inline align-baseline text-xs opacity-50" />
			</a>
			<p class="text-base-content/75 mt-2 text-sm leading-relaxed">{item.summary_ja}</p>
			<p class="text-base-content/50 mt-1.5 flex items-center gap-1 text-xs">
				<Icon icon="mdi:calendar-blank-outline" />
				<time datetime={date}>{formatDate(date, true)}</time>
			</p>
		</div>
		{#if token || marked.has(item.url)}
			<button
				class="btn btn-ghost btn-sm btn-circle -mr-2 shrink-0"
				disabled={!token || pending.has(item.url)}
				onclick={() => toggleMark(date, item.url, item.title_ja)}
				aria-label="興味あり"
				title={token ? '興味あり' : '興味あり（記録済み・閲覧のみ）'}
			>
				<Icon
					icon={marked.has(item.url) ? 'mdi:star' : 'mdi:star-outline'}
					class={marked.has(item.url) ? 'text-warning text-xl' : 'text-xl'}
				/>
			</button>
		{/if}
	</article>
{/snippet}

<div class="bg-base-100 min-h-screen">
	<header class="bg-base-100">
		<div class="mx-auto flex max-w-3xl items-center px-2 pt-3">
			<div class="w-10"></div>
			<a href="{base}/" class="mx-auto flex items-center gap-1.5">
				<Icon icon="mdi:trending-up" class="text-primary text-2xl" />
				<span class="font-serif text-2xl font-bold tracking-wide">Daily Trends</span>
			</a>
			<a href="{base}/admin" class="btn btn-ghost btn-sm btn-circle" aria-label="興味プロファイル管理">
				<Icon icon="mdi:cog-outline" class="text-lg" />
			</a>
		</div>
		<div class="mx-auto flex max-w-3xl items-center justify-center gap-1 px-4 pt-1 pb-2 text-sm">
			{#if adjacent.older}
				<a
					href="{base}/{adjacent.older}{hashFor(current)}"
					class="btn btn-ghost btn-xs btn-circle"
					aria-label="前の週"
				>
					<Icon icon="mdi:chevron-left" class="text-lg" />
				</a>
			{:else}
				<span class="w-6"></span>
			{/if}
			<label class="relative inline-flex items-center gap-1 px-1">
				<span>{formatWeek(week)}</span>
				<span class="text-base-content/60">・{weekItemCount(week)}件</span>
				<Icon icon="mdi:menu-down" class="text-base-content/60" />
				<select
					class="absolute inset-0 cursor-pointer opacity-0"
					aria-label="週を選択"
					value={week.start}
					onchange={(e) => goto(`${base}/${e.currentTarget.value}${hashFor(current)}`)}
				>
					{#each trendWeeks as w (w.start)}
						<option value={w.start}>{formatWeek(w)}（{weekItemCount(w)}件）</option>
					{/each}
				</select>
			</label>
			{#if adjacent.newer}
				<a
					href="{base}/{adjacent.newer}{hashFor(current)}"
					class="btn btn-ghost btn-xs btn-circle"
					aria-label="次の週"
				>
					<Icon icon="mdi:chevron-right" class="text-lg" />
				</a>
			{:else}
				<span class="w-6"></span>
			{/if}
		</div>
	</header>

	<nav
		bind:this={tabBar}
		class="bg-base-100 border-base-300 sticky top-0 z-10 border-b"
		aria-label="カテゴリ"
	>
		<div class="mx-auto flex max-w-3xl overflow-x-auto px-2 [scrollbar-width:none]" role="tablist">
			{#each tabs as tab (tab)}
				<button
					bind:this={tabButtons[tab]}
					role="tab"
					aria-selected={tab === current}
					class="relative shrink-0 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors
						{tab === current ? 'text-primary' : 'text-base-content/60 hover:text-base-content'}"
					onclick={() => selectTab(tab)}
				>
					{tab}
					{#if tab === current}
						<span class="bg-primary absolute inset-x-3 bottom-0 h-0.5 rounded-full"></span>
					{/if}
				</button>
			{/each}
		</div>
	</nav>

	<main
		class="mx-auto min-h-[70vh] max-w-3xl px-4 pb-16"
		ontouchstart={onTouchStart}
		ontouchend={onTouchEnd}
	>
		{#if current === TOP}
			{#each groups as group, gi (group.name)}
				<section class="border-base-300 border-b pt-5 pb-1 last:border-b-0">
					<div class="flex items-center justify-between">
						<h2 class="border-primary border-l-4 pl-2 text-lg font-bold">{group.name}</h2>
						<button class="link-hover text-base-content/60 flex items-center text-xs" onclick={() => selectTab(group.name)}>
							もっと見る<Icon icon="mdi:chevron-right" />
						</button>
					</div>
					<div class="divide-base-300 divide-y">
						{#each group.articles.slice(0, 3) as a, i (a.date + a.item.url)}
							{@render article(a, gi === 0 && i === 0)}
						{/each}
					</div>
				</section>
			{/each}
		{:else if currentGroup}
			<div class="divide-base-300 divide-y">
				{#each currentGroup.articles as a, i (a.date + a.item.url)}
					{@render article(a, i === 0)}
				{/each}
			</div>
		{/if}
	</main>
</div>
