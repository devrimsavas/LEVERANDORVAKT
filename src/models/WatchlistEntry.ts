import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from "sequelize-typescript";
import { User } from "./User.js";
import { CompanyRecord } from "./CompanyRecord.js";

// One company on one user's watchlist.
@Table({ tableName: "watchlist_entries", underscored: true })
export class WatchlistEntry extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare userId: number;

  @BelongsTo(() => User)
  declare user: User;

  @ForeignKey(() => CompanyRecord)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare companyId: number;

  @BelongsTo(() => CompanyRecord)
  declare company: CompanyRecord;

  @Column({ type: DataType.STRING(500), allowNull: true })
  declare note: string | null;
}