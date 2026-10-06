<script lang="ts">
	import TrendDayView from '$lib/components/TrendDayView.svelte';
	import { trendDays } from '$lib/trends';

	const latest = trendDays[0];
</script>

<svelte:head>
	<title>Daily Trends</title>
</svelte:head>

{#if latest}
	<TrendDayView day={latest} />
{:else}
	<p class="text-base-content/60 p-8">まだ投稿がありません。</p>
{/if}
