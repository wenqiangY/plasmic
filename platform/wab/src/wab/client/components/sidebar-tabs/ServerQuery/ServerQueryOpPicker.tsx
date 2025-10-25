import { BottomModalButtons } from "@/wab/client/components/BottomModal";
import { shouldShowHostLessPackage } from "@/wab/client/components/omnibar/Omnibar";
import { StringPropEditor } from "@/wab/client/components/sidebar-tabs/ComponentProps/StringPropEditor";
import { DataPickerTypesSchema } from "@/wab/client/components/sidebar-tabs/DataBinding/DataPicker";
import {
  InnerPropEditorRow,
  PropValueEditorContext,
} from "@/wab/client/components/sidebar-tabs/PropEditorRow";
import { LabeledItemRow } from "@/wab/client/components/sidebar/sidebar-helpers";
import { createFakeHostLessComponent } from "@/wab/client/components/studio/add-drawer/AddDrawer";
import StyleSelect from "@/wab/client/components/style-controls/StyleSelect";
import Button from "@/wab/client/components/widgets/Button";
import { Icon } from "@/wab/client/components/widgets/Icon";
import PlusIcon from "@/wab/client/plasmic/plasmic_kit/PlasmicIcon__Plus";
import SearchIcon from "@/wab/client/plasmic/plasmic_kit/PlasmicIcon__Search";
import { StudioCtx, useStudioCtx } from "@/wab/client/studio-ctx/StudioCtx";
import { TutorialEventsType } from "@/wab/client/tours/tutorials/tutorials-events";
import {
  StudioPropType,
  customFunctionId,
  wabTypeToPropType,
} from "@/wab/shared/code-components/code-components";
import {
  cx,
  ensure,
  ensureArray,
  mkShortId,
  spawn,
  withoutFalsy,
} from "@/wab/shared/common";
import { ExprCtx, clone, codeLit } from "@/wab/shared/core/exprs";
import { DEVFLAGS, HostLessComponentInfo } from "@/wab/shared/devflags";
import {
  ComponentServerQuery,
  CustomFunctionExpr,
  FunctionArg,
  Interaction,
  Site,
  TplNode,
  isKnownComponentServerQuery,
  isKnownExpr,
} from "@/wab/shared/model/classes";
import { smartHumanize } from "@/wab/shared/strs";
import { notification } from "antd";
import { groupBy } from "lodash";
import { observer } from "mobx-react";
import * as React from "react";
import { useMountedState } from "react-use";

import styles from "@/wab/client/components/sidebar-tabs/ServerQuery/ServerQueryOpPicker.module.scss";
import { Tab, Tabs } from "@/wab/client/components/widgets";
import { allCustomFunctions } from "@/wab/shared/cached-selectors";
import {
  executeCustomFunctionOp,
  getCustomFunctionParams,
  useCustomFunctionOp,
} from "@/wab/shared/core/custom-functions";
import { isHostlessPackageInstalledWithHidden } from "@/wab/shared/core/project-deps";
import type { ServerQueryResult } from "@plasmicapp/react-web/lib/data-sources";
import useSWR from "swr";

const LazyCodePreview = React.lazy(
  () => import("@/wab/client/components/coding/CodePreview")
);

interface CustomFunctionExprDraft extends Partial<CustomFunctionExpr> {
  queryName?: string;
}

interface AvailableCustomFunctionInfo {
  item: HostLessComponentInfo;
  projectIds: string[];
}

const INSTALLABLE_PREFIX = "install-custom-function-";

function getAllCustomFunctions(site: Site) {
  return allCustomFunctions(site).map((fnInfo) => fnInfo.customFunction);
}

/**
 * Get all available custom functions from hostless packages that are not yet installed
 */
function getAvailableCustomFunctions(
  studioCtx: StudioCtx
): AvailableCustomFunctionInfo[] {
  const hostLessComponentsMeta =
    studioCtx.appCtx.appConfig.hostLessComponents ??
    DEVFLAGS.hostLessComponents ??
    [];
  const availableCustomFunctions: AvailableCustomFunctionInfo[] = [];

  for (const meta of hostLessComponentsMeta) {
    const isInstalledWithHidden = isHostlessPackageInstalledWithHidden(
      meta,
      studioCtx.site.projectDependencies
    );
    // Only show packages that should be visible
    if (isInstalledWithHidden || !shouldShowHostLessPackage(studioCtx, meta)) {
      continue;
    }
    const projectIds = ensureArray(meta.projectId);

    // Get custom function items from this package
    for (const item of meta.items) {
      if (item.isCustomFunction && !item.hidden && !item.hiddenOnStore) {
        availableCustomFunctions.push({ item, projectIds });
      }
    }
  }
  return availableCustomFunctions;
}

export const ServerQueryOpDraftForm = observer(
  function ServerQueryOpDraftForm(props: {
    value?: CustomFunctionExprDraft;
    onChange: React.Dispatch<React.SetStateAction<CustomFunctionExprDraft>>; // (value: DataSourceOpDraftValue) => void;
    readOnly?: boolean;
    env: Record<string, any> | undefined;
    schema?: DataPickerTypesSchema;
    isDisabled?: boolean;
    showQueryName?: boolean;
    allowedOps?: string[];
    exprCtx: ExprCtx;
  }) {
    const {
      value,
      isDisabled,
      onChange,
      readOnly,
      env: data,
      schema,
      allowedOps,
      showQueryName,
      exprCtx,
    } = props;
    const studioCtx = useStudioCtx();

    const [isInstalling, setIsInstalling] = React.useState(false);
    const installableFunctions = React.useMemo(
      () => getAvailableCustomFunctions(studioCtx),
      [studioCtx.site.projectDependencies.length]
    );
    const availableFunctions = React.useMemo(
      () => getAllCustomFunctions(studioCtx.site),
      [studioCtx.site.projectDependencies.length]
    );

    const argsMap = React.useMemo(
      () => groupBy(value?.args ?? [], (arg) => arg.argType.argName),
      [value]
    );
    const evaluatedArgs = React.useMemo(() => {
      if (!value || !value.func || !value.args) {
        return [];
      }
      return getCustomFunctionParams(
        value as CustomFunctionExpr,
        data,
        exprCtx
      );
    }, [value]);

    const { dataKey, fetcher, funcParamsValues } = React.useMemo(() => {
      const func = value?.func;
      if (!func) {
        return {
          dataKey: null,
          fetcher: null,
          funcParamsValues: [],
        };
      }
      const registeredMeta = studioCtx
        .getRegisteredFunctionsMap()
        .get(customFunctionId(func))?.meta;

      const fnContext = registeredMeta?.fnContext;
      if (!fnContext) {
        return {
          dataKey: null,
          fetcher: null,
          funcParamsValues: evaluatedArgs,
        };
      }

      return {
        ...fnContext(...evaluatedArgs),
        funcParamsValues: evaluatedArgs,
      };
    }, [studioCtx, value?.func, evaluatedArgs]);

    const { data: ccContextData } = useSWR(dataKey, fetcher);

    const propValueEditorContext = React.useMemo(() => {
      return {
        componentPropValues: funcParamsValues ?? [],
        ccContextData,
        exprCtx,
        schema,
        env: data,
      };
    }, [schema, data, funcParamsValues, exprCtx, ccContextData]);

    React.useEffect(() => {
      if (availableFunctions.length === 0 && value?.func) {
        onChange({ ...value, func: undefined, args: [] });
        return;
      }

      const firstFunc = availableFunctions[0];
      if (!value?.func) {
        onChange({ ...value, func: firstFunc, args: [] });
      } else {
        const functionExistsInSite = availableFunctions.some(
          (fn) => fn.uid === value.func?.uid
        );
        if (!functionExistsInSite) {
          // Selected function was removed, reset to first available function
          onChange({ ...value, func: firstFunc, args: [] });
        }
      }
    }, [value?.func?.uid, availableFunctions]);

    const groupedCustomFunctions = groupBy(
      availableFunctions,
      (fn) => fn.namespace ?? null
    );

    const handleInstallCustomFunction = async (
      customFunctionInfo: AvailableCustomFunctionInfo
    ) => {
      setIsInstalling(true);
      try {
        const { item, projectIds } = customFunctionInfo;

        // Track existing custom function IDs before installation
        const existingFunctionIds = new Set(
          getAllCustomFunctions(studioCtx.site).map((fn) => fn.uid)
        );

        const fakeItem = createFakeHostLessComponent(item, projectIds);
        await studioCtx.runFakeItem(fakeItem);

        const newFunc = getAllCustomFunctions(studioCtx.site).find(
          (fn) => !existingFunctionIds.has(fn.uid)
        );

        if (newFunc) {
          onChange({ ...value, func: newFunc, args: [] });
        }
      } catch (error) {
        notification.error({
          message: "Failed to install custom function",
          description: (error as any).message,
        });
      } finally {
        setIsInstalling(false);
      }
    };

    return (
      <div id="data-source-modal-draft-section">
        {showQueryName && (
          <LabeledItemRow label="Query name">
            <StringPropEditor
              value={value?.queryName}
              onChange={(newName) => onChange({ ...value, queryName: newName })}
            />
          </LabeledItemRow>
        )}
        <LabeledItemRow label={"Custom function"}>
          <StyleSelect
            value={value?.func ? customFunctionId(value.func) : undefined}
            placeholder={"Select a custom function"}
            valueSetState={value?.func ? "isSet" : undefined}
            isDisabled={isDisabled || readOnly || isInstalling}
            onChange={(id) => {
              if (value?.func && id === customFunctionId(value.func)) {
                return;
              }

              // Check if this is an installable custom function
              if (id?.startsWith(INSTALLABLE_PREFIX)) {
                const componentName = id.substring(INSTALLABLE_PREFIX.length);
                const customFunctionInfo = installableFunctions.find(
                  (info) => info.item.componentName === componentName
                );
                if (customFunctionInfo) {
                  spawn(handleInstallCustomFunction(customFunctionInfo));
                }
                return;
              }

              const func = availableFunctions.find(
                (fn) => customFunctionId(fn) === id
              );

              onChange({
                ...value,
                func,
                args: [],
              });
            }}
          >
            {Object.keys(groupedCustomFunctions).map((namespace) => {
              const isNullGroup = namespace === "null";
              return (
                <StyleSelect.OptionGroup
                  key={namespace}
                  title={!isNullGroup ? smartHumanize(namespace) : undefined}
                  noTitle={isNullGroup}
                >
                  {groupedCustomFunctions[namespace].map((fn) => {
                    const functionId = customFunctionId(fn);
                    return (
                      <StyleSelect.Option key={fn.uid} value={functionId}>
                        {fn.displayName ?? smartHumanize(fn.importName)}
                      </StyleSelect.Option>
                    );
                  })}
                </StyleSelect.OptionGroup>
              );
            })}
            {installableFunctions.length > 0 && (
              <StyleSelect.OptionGroup title={undefined} noTitle={false}>
                {installableFunctions.map((info) => {
                  const itemId = `${INSTALLABLE_PREFIX}${info.item.componentName}`;
                  return (
                    <StyleSelect.Option key={itemId} value={itemId}>
                      <Icon
                        icon={PlusIcon}
                        style={{ color: "#999", marginRight: 4 }}
                      />
                      {info.item.displayName}
                    </StyleSelect.Option>
                  );
                })}
              </StyleSelect.OptionGroup>
            )}
          </StyleSelect>
        </LabeledItemRow>
        {value?.func && (
          <>
            {value.func.params.map((param) => {
              const argLabel =
                param.displayName ?? smartHumanize(param.argName);
              const curArg =
                param.argName in argsMap
                  ? argsMap[param.argName][0]
                  : undefined;
              const curExpr = curArg?.expr;
              const propType =
                studioCtx
                  .getRegisteredFunctionsMap()
                  .get(customFunctionId(value.func!))
                  ?.meta.params?.find((p) => p.name === param.argName) ??
                wabTypeToPropType(param.type);

              return (
                <PropValueEditorContext.Provider value={propValueEditorContext}>
                  <InnerPropEditorRow
                    attr={param.argName}
                    propType={propType as StudioPropType<any>}
                    expr={curExpr}
                    label={argLabel}
                    valueSetState={curExpr ? "isSet" : undefined}
                    onChange={(expr) => {
                      if (expr == null) {
                        return;
                      }
                      const newExpr = isKnownExpr(expr) ? expr : codeLit(expr);
                      const newArgs = value?.args ?? [];
                      const changedArg = newArgs.find(
                        (arg) => arg.argType === curArg?.argType
                      );
                      if (changedArg) {
                        changedArg.expr = newExpr;
                      } else {
                        newArgs.push(
                          new FunctionArg({
                            uuid: mkShortId(),
                            expr: newExpr,
                            argType: param,
                          })
                        );
                      }

                      onChange({
                        ...value,
                        args: newArgs,
                      });
                    }}
                  />
                </PropValueEditorContext.Provider>
              );
            })}
          </>
        )}
      </div>
    );
  }
);

function _ServerQueryOpPreview(props: {
  data?: Partial<ServerQueryResult>;
  executeQueue: CustomFunctionExpr[];
  setExecuteQueue: React.Dispatch<React.SetStateAction<CustomFunctionExpr[]>>;
  env?: Record<string, any>;
  exprCtx: ExprCtx;
}) {
  const { data, executeQueue, setExecuteQueue, env, exprCtx } = props;
  const studioCtx = useStudioCtx();
  const [mutateOpResults, setMutateOpResults] = React.useState<any | undefined>(
    data
  );
  const [expandLevel, setExpandLevel] = React.useState(3);

  const opResults = mutateOpResults;

  const popExecuteQueue = React.useCallback(async () => {
    if (executeQueue.length > 0) {
      const [nextOp, ...rest] = executeQueue;
      const functionId = customFunctionId(nextOp.func);
      const regFunc = ensure(
        studioCtx.getRegisteredFunctionsMap().get(functionId),
        "Missing registered function for server query"
      );
      try {
        const result = await executeCustomFunctionOp(
          regFunc.function,
          nextOp,
          env,
          exprCtx
        );
        setMutateOpResults(result);
      } catch (err) {
        notification.error({
          message: `Operation failed`,
          description: err.message,
        });
      }
      setExecuteQueue(rest);
    }
  }, [executeQueue, setExecuteQueue]);

  React.useEffect(() => {
    spawn(popExecuteQueue());
  }, [executeQueue, setExecuteQueue]);

  const extraContent = React.useMemo(() => {
    return (
      <div className="flex-row fill-height mr-m flex-vcenter">
        <a onClick={() => setExpandLevel(50)}>Expand All</a>
      </div>
    );
  }, []);

  return (
    <div
      id="data-source-modal-preview-section"
      className={cx(
        "flex fill-width fill-height overflow-hidden ph-lg",
        styles.container
      )}
    >
      <Tabs
        tabKey={"response"}
        className="fill-height"
        tabBarClassName="hilite-tabs justify-between"
        tabClassName="hilite-tab"
        activeTabClassName="hilite-tab--active"
        tabBarExtraContent={extraContent}
        tabs={withoutFalsy([
          new Tab({
            name: "Response",
            key: "response",
            contents: () => (
              <React.Suspense>
                {opResults != null ? (
                  <LazyCodePreview
                    value={JSON.stringify(opResults)}
                    data={{}}
                    className="code-preview-inner"
                    opts={{
                      expandLevel: expandLevel,
                    }}
                  />
                ) : (
                  "Waiting for execution"
                )}
              </React.Suspense>
            ),
          }),
        ])}
      />
    </div>
  );
}

export const ServerQueryOpPreview = React.memo(_ServerQueryOpPreview);

export const ServerQueryOpExprFormAndPreview = observer(
  function ServerQueryOpExprFormAndPreview(props: {
    value?: CustomFunctionExpr;
    onSave: (value: CustomFunctionExpr, opExprName?: string) => void;
    onCancel: () => void;
    readOnly?: boolean;
    env: Record<string, any> | undefined;
    schema?: DataPickerTypesSchema;
    parent?: ComponentServerQuery | TplNode;
    allowedOps?: string[];
    exprCtx: ExprCtx;
    interaction?: Interaction;
  }) {
    const {
      value,
      onSave,
      onCancel,
      readOnly,
      env,
      schema,
      parent,
      allowedOps,
      exprCtx,
    } = props;
    const studioCtx = useStudioCtx();
    const isMounted = useMountedState();
    const [draft, setDraft] = React.useState<CustomFunctionExprDraft>(() => ({
      queryName: isKnownComponentServerQuery(parent) ? parent.name : undefined,
      ...(value ? clone(value) : {}),
    }));

    const [isExecuting, setIsExecuting] = React.useState(false);
    const [executeQueue, setExecuteQueue] = React.useState<
      CustomFunctionExpr[]
    >([]);
    const functionId = value ? customFunctionId(value.func) : undefined;
    const regFunc = functionId
      ? studioCtx.getRegisteredFunctionsMap().get(functionId)
      : undefined;
    const result = useCustomFunctionOp(
      regFunc?.function ?? (() => undefined),
      value,
      env,
      exprCtx
    );

    const missingRequiredArgs = [];
    // const missingRequiredArgs = getMissingRequiredArgsFromDraft(
    //   draft,
    //   exprCtx
    // ).map(([argName, argMeta]) => getArgLabel(argMeta, argName));

    const saveOpExpr = async () => {
      if (isMounted()) {
        if (missingRequiredArgs.length === 0) {
          onSave(
            new CustomFunctionExpr({
              func: draft.func!,
              args: draft.args!,
            }),
            draft.queryName
          );

          studioCtx.tourActionEvents.dispatch({
            type: TutorialEventsType.SaveDataSourceQuery,
          });
        } else {
          notification.error({
            message: `Missing required fields: ${missingRequiredArgs.join(
              ", "
            )}`,
          });
        }
      }
    };

    const contents = (
      <div className="fill-height">
        <div className="flex-row fill-height">
          <div
            className={cx({
              "flex-col fill-height fill-width": true,
            })}
            style={{ width: 500, flexShrink: 0 }}
          >
            <div className="flex-col fill-width fill-height overflow-scroll p-xxlg flex-children-no-shrink">
              <ServerQueryOpDraftForm
                value={draft}
                onChange={(getNewDraft) => {
                  setDraft((old) => {
                    const newDraft =
                      typeof getNewDraft === "function"
                        ? getNewDraft(old)
                        : getNewDraft;
                    return newDraft;
                  });
                }}
                readOnly={readOnly}
                env={env}
                schema={schema}
                isDisabled={readOnly}
                allowedOps={allowedOps}
                showQueryName={isKnownComponentServerQuery(parent)}
                exprCtx={exprCtx}
              />
            </div>
            <BottomModalButtons>
              <Button
                id="data-source-modal-save-btn"
                type="primary"
                onClick={saveOpExpr}
              >
                Save
              </Button>
              <Button
                onClick={async () => {
                  if (isExecuting || executeQueue.length > 0) {
                    return;
                  }
                  setIsExecuting(true);
                  if (draft.func && draft.args) {
                    const opExpr = new CustomFunctionExpr({
                      func: draft.func,
                      args: draft.args,
                    });
                    setExecuteQueue([...executeQueue, opExpr]);
                  }
                  setIsExecuting(false);
                }}
                withIcons={"startIcon"}
                disabled={
                  missingRequiredArgs.length > 0 ||
                  isExecuting ||
                  executeQueue.length > 0
                }
                startIcon={<Icon icon={SearchIcon} />}
                {...(missingRequiredArgs.length > 0
                  ? {
                      tooltip: `Missing required fields: ${missingRequiredArgs.join(
                        ", "
                      )}`,
                    }
                  : {})}
              >
                {isExecuting || executeQueue.length > 0
                  ? "Executing..."
                  : "Execute"}
              </Button>
              <Button onClick={onCancel}>Cancel</Button>
            </BottomModalButtons>
          </div>
          <ServerQueryOpPreview
            data={result}
            executeQueue={executeQueue}
            setExecuteQueue={setExecuteQueue}
            env={env}
            exprCtx={exprCtx}
          />
        </div>
      </div>
    );
    return contents;
  }
);
