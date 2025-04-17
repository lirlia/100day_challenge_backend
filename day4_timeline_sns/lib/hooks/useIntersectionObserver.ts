import { useEffect, RefObject } from 'react';

/**
 * Intersection Observer を使用して、要素がビューポートに入ったときにコールバックを実行するカスタムフック。
 *
 * @param targetRef 監視対象の要素への RefObject。
 * @param onIntersect 要素がビューポートに入ったときに実行されるコールバック関数。
 * @param dependencies コールバック関数が依存する値の配列。変更されると Observer が再設定される。
 * @param options Intersection Observer のオプション。
 */
export function useIntersectionObserver(
  targetRef: RefObject<Element | null>,
  onIntersect: () => void,
  dependencies: any[] = [],
  options?: IntersectionObserverInit
): void {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          // console.log('Intersection detected, calling onIntersect');
          onIntersect();
        }
      },
      options
    );

    const currentTarget = targetRef.current;

    if (currentTarget) {
      // console.log('Starting to observe target:', currentTarget);
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        // console.log('Stopping observation of target:', currentTarget);
        observer.unobserve(currentTarget);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRef, onIntersect, options, ...dependencies]); // 依存配列に dependencies を展開
}
