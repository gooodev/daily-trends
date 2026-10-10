<script lang="ts">
	import TrendWeekView from '$lib/components/TrendWeekView.svelte';
	import { trendWeeks } from '$lib/trends';

	const latest = trendWeeks[0];
</script>

<svelte:head>
	<title>Daily Trends</title>
</svelte:head>

{#if latest}
	<TrendWeekView week={latest} />
{:else}
	<p class="text-base-content/60 p-8">まだ投稿がありません。</p>
{/if}
