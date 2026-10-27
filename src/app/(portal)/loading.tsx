import styles from './loading.module.css';

export default function PortalLoading() {
  return (
    <div className={styles.loading} aria-label="Loading page" aria-busy="true">
      <header className="page-header">
        <div>
          <span className={`${styles.skeleton} ${styles.eyebrow}`} />
          <span className={`${styles.skeleton} ${styles.title}`} />
          <span className={`${styles.skeleton} ${styles.copy}`} />
        </div>
      </header>
      <section className="stats" aria-hidden="true">
        {[0, 1, 2].map((item) => (
          <article key={item}>
            <span className={`${styles.skeleton} ${styles.label}`} />
            <span className={`${styles.skeleton} ${styles.number}`} />
          </article>
        ))}
      </section>
      <section className={`surface ${styles.surface}`} aria-hidden="true">
        <div className="surface-toolbar"><span className={`${styles.skeleton} ${styles.heading}`} /></div>
        {[0, 1, 2, 3].map((item) => (
          <div className={styles.row} key={item}>
            <span className={styles.skeleton} /><span className={styles.skeleton} /><span className={styles.skeleton} />
          </div>
        ))}
      </section>
    </div>
  );
}
