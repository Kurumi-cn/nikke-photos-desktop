// 更多：功能入口集合
import { Link } from 'react-router-dom'
import { t } from '../lib/i18n.js'

const ENTRIES = [
  { to: '/about', title: '关于', desc: '软件版本、第三方来源、开源许可与资源说明' },
  { to: '/custom-nikke/new', title: '新增妮姬', desc: '补充尚未收录的角色，添加资料、头像与立绘，仅保存在本机' },
  {
    to: '/profiles',
    title: '存档管理',
    desc: '新建、切换、重命名或删除存档；查看每个存档已完善的角色',
  },
  {
    to: '/bot-share',
    title: 'BOT 分享',
    desc: '导出角色数据分享码和表格码，粘贴给 QQ 机器人出面板图与练度统计表',
  },
  {
    to: '/schemes',
    title: '方案管理',
    desc: '预先存好一组默认值（基础 / 研究所与技能 / 魔方与收藏品），在数据录入页一键应用到角色',
  },
  {
    to: '/changelog',
    title: '更新记录',
    desc: '查看历史版本都改了些什么',
  },
]

export default function MyPage() {
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>{t('更多')}</h1>
          <div className="desc">{t('常用功能入口')}</div>
        </div>
      </div>
      <div className="my-grid">
        {ENTRIES.map((entry) => (
          <Link key={entry.to} className="my-card" to={entry.to}>
            <b>{t(entry.title)}</b>
            <span>{t(entry.desc)}</span>
          </Link>
        ))}
      </div>
      <div className="my-contact">
        <p>作者：B站 <a href="https://space.bilibili.com/1753455535" target="_blank" rel="noopener noreferrer">-小云雀来海-</a></p>
        <p>BUG反馈和意见：QQ 2096317545</p>
        <p>交流群：1126223078</p>
      </div>
    </main>
  )
}
