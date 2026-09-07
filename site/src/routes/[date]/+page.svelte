<script lang="ts">
	import { base } from '$app/paths';
	import Icon from '@iconify/svelte';
	import { getStoredToken } from '$lib/auth';
	import { fetchMarks, addMark, removeMark } from '$lib/marks';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const day = $derived(data.day);

	let token = $state('');
	let marked = $state<Set<string>>(new Set());
	let pending = $state<Set<string>>(new Set());

	token = getStoredToken();

	$effect(() => {
		fetchMarks(day.date).then((urls) => (marked = urls));
	});

	async function toggleMark(url: string, titleJa: string) {
		if (!token || pending.has(url)) return;
		const wasMarked = marked.has(url);
		const next = new Set(marked);
		wasMarked ? next.delete(url) : next.add(url);
		marked = next;
		pending = new Set(pending).add(url);
		try {
			if (wasMarked) {
				await removeMark(token, day.date, url);
			} else {
				await addMark(token, day.date, url, titleJa);
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

<svelte:head>
	<title>{day.date} トレンド | Daily Trends</title>
</svelte:head>

<div class="bg-base-200 min-h-screen">
	<div class="navbar bg-base-100 shadow-sm">
		<div class="mx-auto flex w-full max-w-3xl items-center gap-2 px-4">
			<a href="{base}/" class="btn btn-ghost btn-sm gap-1">
				<Icon icon="mdi:arrow-left" />
				一覧へ
			</a>
			<span class="text-lg font-bold">{day.date} トレンド</span>
		</div>
	</div>

	<main class="mx-auto max-w-3xl space-y-8 px-4 py-8">
		{#each day.categories as cat (cat.name)}
			<section>
				<h2 class="mb-3 text-xl font-bold">{cat.name}</h2>
				<div class="space-y-3">
					{#each cat.items as item (item.url)}
						<div class="card bg-base-100 shadow-sm">
							<div class="card-body">
								<div class="flex items-start gap-2">
									<a
										href={item.url}
										target="_blank"
										rel="noopener noreferrer"
										class="card-title link link-hover text-base flex-1"
									>
										{item.title_ja}
										<Icon icon="mdi:open-in-new" class="inline text-sm opacity-60" />
									</a>
									{#if token || marked.has(item.url)}
										<button
											class="btn btn-ghost btn-sm btn-circle"
											disabled={!token || pending.has(item.url)}
											onclick={() => toggleMark(item.url, item.title_ja)}
											aria-label="興味あり"
											title={token ? '興味あり' : '興味あり（記録済み・閲覧のみ）'}
										>
											<Icon
												icon={marked.has(item.url) ? 'mdi:star' : 'mdi:star-outline'}
												class={marked.has(item.url) ? 'text-warning text-xl' : 'text-xl'}
											/>
										</button>
									{/if}
								</div>
								<p class="text-base-content/80">{item.summary_ja}</p>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/each}
	</main>
</div>
