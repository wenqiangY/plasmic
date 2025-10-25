// 必须早期初始化全局变量，以便导入的代码能够检测到我们运行的环境
import { loadConfig } from "@/wab/server/config";
import { getLastBundleVersion } from "@/wab/server/db/BundleMigrator";
import { ensureDbConnection } from "@/wab/server/db/DbCon";
import { initDb } from "@/wab/server/db/DbInitUtil";
import {
  DbMgr,
  DEFAULT_DEV_PASSWORD,
  normalActor,
  SUPER_USER,
} from "@/wab/server/db/DbMgr";
import { seedTestFeatureTiers } from "@/wab/server/db/seed/feature-tier";
import { FeatureTier, Team, User } from "@/wab/server/entities/Entities";
import { logger } from "@/wab/server/observability";
import { getBundleInfo, PkgMgr } from "@/wab/server/pkg-mgr";
import { Bundler } from "@/wab/shared/bundler";
import { ensureType, spawn } from "@/wab/shared/common";
import { defaultComponentKinds } from "@/wab/shared/core/components";
import { createSite } from "@/wab/shared/core/sites";
import { InsertableTemplatesGroup, Installable } from "@/wab/shared/devflags";
import {
  InsertableId,
  PLEXUS_INSERTABLE_ID,
  PLUME_INSERTABLE_ID,
} from "@/wab/shared/insertables";
import { kebabCase, startCase } from "lodash";
import { EntityManager } from "typeorm";

if (require.main === module) {
  spawn(main());
}

async function main() {
  const config = loadConfig();
  const con = await ensureDbConnection(config.databaseUri, "default");
  await con.transaction(async (em) => {
    await initDb(em);
    await seedTestDb(em);
    logger().info("done");
  });
}

export async function seedTestDb(em: EntityManager) {
  const db = new DbMgr(em, SUPER_USER);

  // admin@admin.example.com 是管理员用户，因为它的 admin.com 域名
  // (参见 `isCoreTeamEmail`)，这意味着它将获得提升的权限，
  // 不会像普通账户那样行为。
  // 避免使用此账户进行测试。
  const { user: adminUser } = await seedTestUserAndProjects(em, {
    email: "admin@admin.example.com",
    firstName: "Plasmic",
    lastName: "管理员",
  });
  // user@example.com 和 user2@example.com 表现得像普通账户。
  const { user: user1 } = await seedTestUserAndProjects(em, {
    email: "user@example.com",
    firstName: "Plasmic",
    lastName: "用户",
  });
  const { user: user2 } = await seedTestUserAndProjects(em, {
    email: "user2@example.com",
    firstName: "Plasmic",
    lastName: "用户 2",
  });

  const { enterpriseFt, teamFt, proFt, starterFt } = await seedTestFeatureTiers(
    em
  );

  const enterpriseOrg = await seedTeam(
    em,
    user1,
    "测试企业组织",
    enterpriseFt
  );
  await seedTeam(
    em,
    user1,
    "测试企业子组织 A",
    enterpriseFt,
    enterpriseOrg
  );
  await seedTeam(
    em,
    user1,
    "测试企业子组织 B",
    enterpriseFt,
    enterpriseOrg
  );
  await seedTeam(em, user1, "测试规模组织", teamFt);
  await seedTeam(em, user2, "测试专业组织", proFt);
  await seedTeam(em, user2, "测试入门组织", starterFt);

  await seedTestPromotionCodes(em);

  // 初始化特殊包，必须在创建一些用户后完成
  const sysnames: InsertableId[] = [PLUME_INSERTABLE_ID, PLEXUS_INSERTABLE_ID];
  await Promise.all(
    sysnames.map(async (sysname) => await new PkgMgr(db, sysname).seedPkg())
  );

  const plexusBundleInfo = getBundleInfo(PLEXUS_INSERTABLE_ID);

  await db.setDevFlagOverrides(
    JSON.stringify(
      {
        plexus: true,
        installables: ensureType<Installable[] | undefined>([
          {
            type: "ui-kit",
            isInstallOnly: true,
            isNew: true,
            name: "Plasmic 设计系统",
            projectId: plexusBundleInfo.projectId,
            imageUrl: "https://static1.plasmic.app/plasmic-logo.png",
            entryPoint: {
              type: "arena",
              name: "组件",
            },
          },
        ]),
        insertableTemplates: ensureType<InsertableTemplatesGroup | undefined>({
          type: "insertable-templates-group",
          name: "root",
          // 以下为每个 plexus 组件实现以下功能：
          // {
          //   "type": "insertable-templates-component",
          //   "projectId": "mSQqkNd8CL5vNdDTXJPXfU",
          //   "componentName": "Plexus Button",
          //   "templateName": "plexus/button",
          //   "imageUrl": "https://static1.plasmic.app/antd_button.svg"
          // }
          items: [
            {
              type: "insertable-templates-group" as const,
              name: "组件",
              items: Object.keys(defaultComponentKinds).map((item) => ({
                componentName: startCase(item),
                templateName: `${plexusBundleInfo.sysname}/${kebabCase(item)}`,
                imageUrl: `https://static1.plasmic.app/insertables/${kebabCase(
                  item
                )}.svg`,
                type: "insertable-templates-component" as const,
                projectId: plexusBundleInfo.projectId,
                tokenResolution: "reuse-by-name" as const,
              })),
            },
          ].filter((insertableGroup) => insertableGroup.items.length > 0),
        }),
        insertPanelContent: {
          aliases: {
            // 由 @plasmicapp/react-web 提供的组件
            dataFetcher: "builtincc:plasmic-data-source-fetcher",
            pageMeta: "builtincc:hostless-plasmic-head",

            // 默认组件
            ...Object.keys(defaultComponentKinds).reduce((acc, defaultKind) => {
              acc[defaultKind] = `default:${defaultKind}`;
              return acc;
            }, {}),
          },
          builtinSections: {
            Home: {
              Basic: [
                "text",
                "heading",
                "link",
                "linkContainer",
                "section",
                "columns",
                "vstack",
                "hstack",
                "grid",
                "box",
                "image",
                "icon",
              ],
              // 这可能使用 Plexus 或 Plume，取决于 `plexus` 开发标志
              "可定制组件": Object.keys(defaultComponentKinds),
              高级: ["pageMeta", "dataFetcher"],
            },
          },
          // 安装所有按钮
          builtinSectionsInstallables: {
            // 我们只需要它用于 Plexus
            "可定制组件": plexusBundleInfo.projectId,
          },
        },
      },
      null,
      2
    )
  );
}

export async function seedTestUserAndProjects(
  em: EntityManager,
  userInfo: {
    email: string;
    password?: string;
    firstName?: string;
    lastName?: string;
  },
  numProjects = 2
) {
  const db0 = new DbMgr(em, SUPER_USER);

  const user = await db0.createUser({
    email: userInfo.email,
    password: userInfo.password || DEFAULT_DEV_PASSWORD,
    firstName: userInfo.firstName || "Plasmic",
    lastName: userInfo.lastName || "用户",
    needsIntroSplash: false,
    needsSurvey: false,
    needsTeamCreationPrompt: false,
  });
  await db0.markEmailAsVerified(user);
  const db = new DbMgr(em, normalActor(user.id));
  for (let projectNum = 1; projectNum <= numProjects; ++projectNum) {
    const { project } = await db.createProject({
      name: `Plasmic 项目 ${projectNum}`,
    });
    await db.updateProject({
      id: project.id,
      name: `真正的 Plasmic 项目 ${projectNum}`,
    });
    await db.saveProjectRev({
      projectId: project.id,
      data: '{"hello": "world"}',
      revisionNum: 2,
    });
    await db.getLatestProjectRev(project.id);

    // 需要将其设置回正常的占位符。
    const site = createSite();
    const siteBundle = new Bundler().bundle(
      site,
      "",
      await getLastBundleVersion()
    );
    await db.saveProjectRev({
      projectId: project.id,
      data: JSON.stringify(siteBundle),
      revisionNum: 3,
    });
  }

  const projects = await db.listProjectsForSelf();

  logger().info(
    `Inserted user id=${user.id} email=${
      user.email
    } with projects ids=${projects.map((p) => p.id).join(",")}`
  );

  return { user, projects };
}

async function seedTeam(
  em: EntityManager,
  user: User,
  name: string,
  featureTier: FeatureTier,
  parentTeam?: Team
) {
  const db = new DbMgr(em, normalActor(user.id));
  let team = await db.createTeam(name);

  const db0 = new DbMgr(em, SUPER_USER);
  team = await db0.sudoUpdateTeam({
    id: team.id,
    featureTierId: featureTier.id,
    parentTeamId: parentTeam?.id,
  });

  logger().info(
    `Inserted team id=${team.id} name=${team.name} owned by user id=${user.id} email=${user.email} with feature tier id=${featureTier.id} name=${featureTier.name}`
  );

  return team;
}

async function seedTestPromotionCodes(em: EntityManager) {
  const db0 = new DbMgr(em, SUPER_USER);
  await db0.createPromotionCode(
    "FREETESTING",
    "FREETESTING - 免费测试试用",
    30,
    null
  );
}
