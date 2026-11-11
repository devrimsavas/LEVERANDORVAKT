import { Table, Column, Model, DataType } from "sequelize-typescript";

// A cached answer from Brreg or Kartverket, see migration 0011
@Table({ tableName: "trend_cache", underscored: true })
export class TrendCache extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  @Column({ type: DataType.STRING(200), allowNull: false, unique: true })
  declare key: string;

  @Column({ type: DataType.JSONB, allowNull: false })
  declare value: unknown;

  @Column({ type: DataType.DATE, allowNull: false })
  declare expiresAt: Date;
}
