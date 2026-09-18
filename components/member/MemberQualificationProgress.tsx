type QualificationEvidence = {
  eventId: string;
  orderNumber: string;
  finalizedAt: string;
  amount: number;
  remainingAmount: number;
  activeSubscriptionAtCompletion: boolean;
};

type QualificationPath = {
  path: "general" | "subscription";
  windowDays: number;
  windowStartedAt: string;
  windowEndedAt: string;
  threshold: number;
  cumulativeAmount: number;
  remainingToThreshold: number;
  progressPercent: number;
  activeSubscriptionRequired: boolean;
  activeSubscriptionSatisfied: boolean;
  passed: boolean;
  evidence: QualificationEvidence[];
};

type QualificationProgress = {
  mode: "general" | "subscription" | "either" | "both";
  qualificationBasis: "money" | "pv";
  pointDisplayName: string;
  activeSubscriptionNow: boolean;
  isQualifiedNow: boolean;
  progressConditionsPassed: boolean;
  status:
    | "qualified"
    | "ready_on_next_completion"
    | "in_progress";
  activeCoverage: {
    roundId: string;
    qualifiedAt: string;
    coverageStartsAt: string;
    coverageEndsAt: string;
    selectedPaths: Array<"general" | "subscription">;
    rulesVersion: number;
    qualificationBasis: "money" | "pv";
    consumedAmount: number;
    availableAmountBefore: number;
    remainingAmountAfter: number;
    sourceEvidence: Array<{
      eventId: string;
      orderNumber: string;
      finalizedAt: string;
      eventAmount: number;
      allocatedAmount: number;
      cumulativeAllocatedAmount: number;
      triggeredQualification: boolean;
      activeSubscriptionAtCompletion: boolean;
    }>;
  } | null;
  general: QualificationPath;
  subscription: QualificationPath;
};

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function displayPointName(value: string) {
  const normalized = value.trim() || "KD點";

  return /^[A-Za-z]+$/.test(normalized)
    ? normalized.toUpperCase()
    : normalized;
}

function metricValue(
  value: number,
  basis: QualificationProgress["qualificationBasis"],
  pointName: string,
) {
  if (basis === "pv") {
    return `${value.toLocaleString("zh-TW", {
      maximumFractionDigits: 2,
    })} ${pointName}`;
  }

  return `NT$ ${value.toLocaleString("zh-TW", {
    maximumFractionDigits: 0,
  })}`;
}

function pathName(path: QualificationPath["path"]) {
  return path === "subscription"
    ? "定期配送會員"
    : "一般會員";
}

function modeSummary(
  progress: QualificationProgress,
) {
  if (progress.mode === "general") {
    return "依一般會員資格判定";
  }

  if (progress.mode === "subscription") {
    return "依有效定期配送會員資格判定";
  }

  if (progress.mode === "both") {
    return "需同時符合一般會員與定期配送會員資格";
  }

  return "一般會員或定期配送會員任一路徑達成即可";
}

function relevantPaths(
  progress: QualificationProgress,
) {
  if (progress.mode === "general") {
    return [progress.general];
  }

  if (progress.mode === "subscription") {
    return [progress.subscription];
  }

  return [
    progress.general,
    progress.subscription,
  ];
}

function primaryPath(
  progress: QualificationProgress,
) {
  if (progress.mode === "general") {
    return progress.general;
  }

  if (progress.mode === "subscription") {
    return progress.subscription;
  }

  if (
    progress.activeSubscriptionNow &&
    (
      progress.subscription.passed ||
      progress.subscription.remainingToThreshold <=
        progress.general.remainingToThreshold
    )
  ) {
    return progress.subscription;
  }

  return progress.general;
}

export default function MemberQualificationProgress({
  progress,
}: {
  progress: QualificationProgress;
}) {
  const pointName =
    displayPointName(progress.pointDisplayName);

  const metricName =
    progress.qualificationBasis === "pv"
      ? `商品 ${pointName}`
      : "有效消費";

  const primary =
    primaryPath(progress);

  const paths =
    relevantPaths(progress);

  const headline = progress.isQualifiedNow
    ? "已達推薦回饋資格"
    : progress.status === "ready_on_next_completion"
      ? "資格條件已達成"
      : `尚差 ${metricValue(
          primary.remainingToThreshold,
          progress.qualificationBasis,
          pointName,
        )}`;

  const supportingText =
    progress.isQualifiedNow
      ? progress.activeCoverage
        ? `目前資格有效至 ${formatDate(
            progress.activeCoverage.coverageEndsAt,
          )}`
        : "目前已符合推薦回饋領取資格。"
      : progress.status === "ready_on_next_completion"
        ? "目前累積條件已符合，系統會依正式訂單完成事件確認資格。"
        : `最近 ${primary.windowDays} 天累積${metricName}即可逐步達成資格。`;

  const mainProgressPercent =
    progress.isQualifiedNow
      ? 100
      : primary.progressPercent;

  const mainMetricLabel =
    progress.isQualifiedNow
      ? "目前資格"
      : metricName;

  const mainMetricValue =
    progress.isQualifiedNow
      ? "有效"
      : metricValue(
          primary.cumulativeAmount,
          progress.qualificationBasis,
          pointName,
        );

  const mainMetricTarget =
    progress.isQualifiedNow &&
    progress.activeCoverage
      ? `至 ${formatDate(
          progress.activeCoverage.coverageEndsAt,
        )}`
      : `目標 ${metricValue(
          primary.threshold,
          progress.qualificationBasis,
          pointName,
        )}`;

  const qualificationPathLabel =
    progress.activeCoverage?.selectedPaths
      .map((path) =>
        path === "subscription"
          ? "定期配送會員"
          : "一般會員",
      )
      .join(" ＋ ") || "";

  return (
    <section
      className={`member-qualification-panel ${
        progress.isQualifiedNow
          ? "is-qualified"
          : ""
      }`}
      id="qualification"
      aria-labelledby="member-qualification-title"
    >
      <div className="member-qualification-panel-head">
        <div>
          <small>
            REFERRAL REWARD QUALIFICATION
          </small>

          <h2 id="member-qualification-title">
            推薦回饋資格
          </h2>

          <p>
            {modeSummary(progress)}
          </p>
        </div>

        <span
          className={`member-qualification-status ${
            progress.isQualifiedNow
              ? "is-qualified"
              : ""
          }`}
        >
          {progress.isQualifiedNow
            ? "資格有效"
            : "累積中"}
        </span>
      </div>

      <div className="member-qualification-highlight">
        <div>
          <small>目前狀態</small>

          <strong>{headline}</strong>

          <span>{supportingText}</span>
        </div>

        <div className="member-qualification-primary-value">
          <small>{mainMetricLabel}</small>

          <strong>
            {mainMetricValue}
          </strong>

          <span>
            {mainMetricTarget}
          </span>
        </div>
      </div>

      <div
        className="member-qualification-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(
          mainProgressPercent,
        )}
        aria-label="推薦回饋資格進度"
      >
        <i
          style={{
            width: `${Math.max(
              0,
              Math.min(
                100,
                mainProgressPercent,
              ),
            )}%`,
          }}
        />
      </div>

      <div className="member-qualification-progress-meta">
        <span>
          {Math.round(mainProgressPercent)}%
        </span>

        <span>
          {progress.isQualifiedNow
            ? "目前已符合資格"
            : primary.remainingToThreshold > 0
              ? `還差 ${metricValue(
                  primary.remainingToThreshold,
                  progress.qualificationBasis,
                  pointName,
                )}`
              : "條件已達成"}
        </span>
      </div>

      <details className="member-qualification-details">
        <summary>
          <span>
            <small>QUALIFICATION DETAILS</small>
            <strong>查看資格計算明細</strong>
          </span>

          <b>＋</b>
        </summary>

        <div className="member-qualification-details-body">
          {progress.activeCoverage && (
            <div className="member-qualification-coverage">
              <small>目前有效資格</small>

              <strong>
                {formatDate(
                  progress.activeCoverage.coverageStartsAt,
                )}{" "}
                ～{" "}
                {formatDate(
                  progress.activeCoverage.coverageEndsAt,
                )}
              </strong>

              <span>
                達成日期：
                {formatDate(
                  progress.activeCoverage.qualifiedAt,
                )}
              </span>
            </div>
          )}

          {progress.isQualifiedNow &&
            progress.activeCoverage &&
            progress.activeCoverage.sourceEvidence.length > 0 && (
              <details className="member-qualification-current-evidence">
                <summary>
                  <span>
                    <small>
                      CURRENT QUALIFICATION EVIDENCE
                    </small>

                    <strong>
                      查看本期合格消費
                    </strong>
                  </span>

                  <span className="member-qualification-current-evidence-summary">
                    共{" "}
                    {
                      progress.activeCoverage
                        .sourceEvidence.length
                    }{" "}
                    筆
                  </span>
                </summary>

                <div className="member-qualification-current-evidence-body">
                  <div className="member-qualification-current-evidence-intro">
                    <div>
                      <small>本期取得資格</small>

                      <strong>
                        {formatDate(
                          progress.activeCoverage
                            .coverageStartsAt,
                        )}{" "}
                        ～{" "}
                        {formatDate(
                          progress.activeCoverage
                            .coverageEndsAt,
                        )}
                      </strong>
                    </div>

                    <div>
                      <small>本期資格使用</small>

                      <strong>
                        {metricValue(
                          progress.activeCoverage
                            .consumedAmount,
                          progress.activeCoverage
                            .qualificationBasis,
                          pointName,
                        )}
                      </strong>
                    </div>

                    <div>
                      <small>達標路徑</small>

                      <strong>
                        {qualificationPathLabel}
                      </strong>
                    </div>
                  </div>

                  <div className="member-qualification-current-evidence-list">
                    {progress.activeCoverage.sourceEvidence.map(
                      (item, index) => (
                        <article
                          key={item.eventId}
                          className="member-qualification-current-evidence-item"
                        >
                          <div className="member-qualification-current-evidence-order">
                            <span className="member-qualification-current-evidence-index">
                              {String(index + 1).padStart(
                                2,
                                "0",
                              )}
                            </span>

                            <div>
                              <small>
                                {formatDate(
                                  item.finalizedAt,
                                )}
                              </small>

                              <strong>
                                {item.orderNumber}
                              </strong>
                            </div>

                            {item.triggeredQualification && (
                              <span className="member-qualification-trigger-badge">
                                本筆達標
                              </span>
                            )}
                          </div>

                          <div className="member-qualification-current-evidence-values">
                            <div>
                              <small>
                                訂單合格值
                              </small>

                              <strong>
                                {metricValue(
                                  item.eventAmount,
                                  progress
                                    .activeCoverage!
                                    .qualificationBasis,
                                  pointName,
                                )}
                              </strong>
                            </div>

                            <div>
                              <small>
                                本期採計
                              </small>

                              <strong>
                                {metricValue(
                                  item.allocatedAmount,
                                  progress
                                    .activeCoverage!
                                    .qualificationBasis,
                                  pointName,
                                )}
                              </strong>
                            </div>

                            <div>
                              <small>
                                累積採計
                              </small>

                              <strong>
                                {metricValue(
                                  item.cumulativeAllocatedAmount,
                                  progress
                                    .activeCoverage!
                                    .qualificationBasis,
                                  pointName,
                                )}
                              </strong>
                            </div>
                          </div>
                        </article>
                      ),
                    )}
                  </div>

                  <p className="member-qualification-current-evidence-note">
                    此處顯示的是實際用於取得目前推薦回饋資格的已完成訂單；同一筆已採計消費不會重複計入下一資格週期。
                  </p>
                </div>
              </details>
            )}

          {progress.isQualifiedNow && (
            <div className="member-qualification-next-cycle">
              <small>
                NEXT QUALIFICATION CYCLE
              </small>

              <strong>
                下一資格週期累積
              </strong>

              <span>
                你目前的推薦回饋資格仍然有效。以下顯示下一個資格週期重新累積的進度，不影響目前有效資格。
              </span>
            </div>
          )}

          <div className="member-qualification-path-grid">
            {paths.map((path) => (
              <article
                className={`member-qualification-path ${
                  path.passed
                    ? "is-passed"
                    : ""
                }`}
                key={path.path}
              >
                <header>
                  <div>
                    <small>
                      {path.path === "subscription"
                        ? "SUBSCRIPTION"
                        : "GENERAL"}
                    </small>

                    <strong>
                      {pathName(path.path)}
                    </strong>
                  </div>

                  <b>
                    {progress.isQualifiedNow
                      ? "下一輪累積"
                      : path.passed
                        ? "已達標"
                        : path.activeSubscriptionRequired &&
                            !path.activeSubscriptionSatisfied
                          ? "目前未啟用"
                          : "累積中"}
                  </b>
                </header>

                <div className="member-qualification-path-numbers">
                  <div>
                    <small>
                      最近 {path.windowDays} 天累積
                    </small>

                    <strong>
                      {metricValue(
                        path.cumulativeAmount,
                        progress.qualificationBasis,
                        pointName,
                      )}
                    </strong>
                  </div>

                  <div>
                    <small>資格門檻</small>

                    <strong>
                      {metricValue(
                        path.threshold,
                        progress.qualificationBasis,
                        pointName,
                      )}
                    </strong>
                  </div>
                </div>

                <div className="member-qualification-mini-track">
                  <i
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(
                          100,
                          path.progressPercent,
                        ),
                      )}%`,
                    }}
                  />
                </div>

                {path.activeSubscriptionRequired &&
                  !path.activeSubscriptionSatisfied && (
                    <p className="member-qualification-note">
                      此路徑需目前具有有效的定期配送資格。
                    </p>
                  )}

                {path.evidence.length > 0 ? (
                  <div className="member-qualification-evidence">
                    <div className="member-qualification-evidence-head">
                      <span>完成訂單</span>
                      <span>{metricName}</span>
                    </div>

                    {path.evidence.map((event) => (
                      <div
                        className="member-qualification-evidence-row"
                        key={`${path.path}-${event.eventId}`}
                      >
                        <span>
                          <strong>
                            {event.orderNumber}
                          </strong>
                          <small>
                            {formatDate(
                              event.finalizedAt,
                            )}
                          </small>
                        </span>

                        <span>
                          <strong>
                            {metricValue(
                              event.amount,
                              progress.qualificationBasis,
                              pointName,
                            )}
                          </strong>

                          {event.remainingAmount !==
                            event.amount && (
                            <small>
                              目前可計入{" "}
                              {metricValue(
                                event.remainingAmount,
                                progress.qualificationBasis,
                                pointName,
                              )}
                            </small>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="member-qualification-empty">
                    目前下一資格週期尚無可重新計入的已完成訂單。
                  </p>
                )}
              </article>
            ))}
          </div>

          <p className="member-qualification-footnote">
            資格進度依已完成訂單與目前後台規則計算；已用於取得目前資格的消費不會重複計入下一資格週期。
          </p>
        </div>
      </details>
    </section>
  );
}