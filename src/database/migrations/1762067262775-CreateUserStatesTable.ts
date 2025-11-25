import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserStatesTable1762067262775 implements MigrationInterface {
  name = 'CreateUserStatesTable1762067262775';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`user_states\` (\`id\` int NOT NULL AUTO_INCREMENT, \`phone\` varchar(50) NOT NULL, \`name\` varchar(100) NULL, \`business_id\` int NOT NULL, \`state\` varchar(255) NULL, \`last_message\` text NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_ada3add8dce14c6f793988bdb1\` (\`phone\`, \`business_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_subsub_categories\` DROP FOREIGN KEY \`FK_ae6879221a152e5a349ad846344\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_subsub_categories\` CHANGE \`subcategoryId\` \`subcategoryId\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_subcategories\` DROP FOREIGN KEY \`FK_a3ceae719e4fd83066e83d8371b\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_subcategories\` CHANGE \`categoryId\` \`categoryId\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_categories\` DROP FOREIGN KEY \`FK_408cd327d592771780bb6a759df\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_categories\` CHANGE \`businessId\` \`businessId\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`customers\` DROP FOREIGN KEY \`FK_652f05fd67ef9354cb047aae572\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`customers\` CHANGE \`email\` \`email\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`customers\` CHANGE \`created_at\` \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE \`customers\` CHANGE \`businessId\` \`businessId\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscriptions\` DROP FOREIGN KEY \`FK_7e9f8a764f844a37dc4a968494a\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscriptions\` DROP FOREIGN KEY \`FK_7536cba909dd7584a4640cad7d5\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscriptions\` CHANGE \`businessId\` \`businessId\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscriptions\` CHANGE \`planId\` \`planId\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`businesses\` DROP FOREIGN KEY \`FK_02e7bfb8e766e8e0ef449cc0f36\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`businesses\` CHANGE \`ownerId\` \`ownerId\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` CHANGE \`phone\` \`phone\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` CHANGE \`created_at\` \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` CHANGE \`updated_at\` \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE \`business_logs\` DROP FOREIGN KEY \`FK_3b1f2fb3e2c5094da0d71cb5c6f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`business_logs\` CHANGE \`description\` \`description\` text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`business_logs\` CHANGE \`created_at\` \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE \`business_logs\` CHANGE \`businessId\` \`businessId\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_sessions\` DROP FOREIGN KEY \`FK_b92819d35788ce4f13232c8f17f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_sessions\` CHANGE \`created_at\` \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_sessions\` CHANGE \`businessId\` \`businessId\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` DROP FOREIGN KEY \`FK_2234441aac965d27bd93edb33d6\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` DROP FOREIGN KEY \`FK_cd3cd1906c2198f36dc5e7fe4d4\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` CHANGE \`created_at\` \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` CHANGE \`businessId\` \`businessId\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` CHANGE \`customerId\` \`customerId\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` DROP FOREIGN KEY \`FK_359bd8406fbfb50e3ea42b5631f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` DROP FOREIGN KEY \`FK_a1eac2ff237dae6d166c340c71b\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` CHANGE \`description\` \`description\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` CHANGE \`created_at\` \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` CHANGE \`businessId\` \`businessId\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` CHANGE \`subsubCategoryId\` \`subsubCategoryId\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` DROP FOREIGN KEY \`FK_778777c5d7d56ed1bbaa907b8e5\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` DROP FOREIGN KEY \`FK_e5de51ca888d8b1f5ac25799dd1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` CHANGE \`created_at\` \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` CHANGE \`businessId\` \`businessId\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` CHANGE \`customerId\` \`customerId\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_subsub_categories\` ADD CONSTRAINT \`FK_ae6879221a152e5a349ad846344\` FOREIGN KEY (\`subcategoryId\`) REFERENCES \`product_subcategories\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_subcategories\` ADD CONSTRAINT \`FK_a3ceae719e4fd83066e83d8371b\` FOREIGN KEY (\`categoryId\`) REFERENCES \`product_categories\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_categories\` ADD CONSTRAINT \`FK_408cd327d592771780bb6a759df\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`customers\` ADD CONSTRAINT \`FK_652f05fd67ef9354cb047aae572\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscriptions\` ADD CONSTRAINT \`FK_7e9f8a764f844a37dc4a968494a\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscriptions\` ADD CONSTRAINT \`FK_7536cba909dd7584a4640cad7d5\` FOREIGN KEY (\`planId\`) REFERENCES \`subscription_plans\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`businesses\` ADD CONSTRAINT \`FK_02e7bfb8e766e8e0ef449cc0f36\` FOREIGN KEY (\`ownerId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`business_logs\` ADD CONSTRAINT \`FK_3b1f2fb3e2c5094da0d71cb5c6f\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_sessions\` ADD CONSTRAINT \`FK_b92819d35788ce4f13232c8f17f\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` ADD CONSTRAINT \`FK_2234441aac965d27bd93edb33d6\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` ADD CONSTRAINT \`FK_cd3cd1906c2198f36dc5e7fe4d4\` FOREIGN KEY (\`customerId\`) REFERENCES \`customers\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` ADD CONSTRAINT \`FK_359bd8406fbfb50e3ea42b5631f\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` ADD CONSTRAINT \`FK_a1eac2ff237dae6d166c340c71b\` FOREIGN KEY (\`subsubCategoryId\`) REFERENCES \`product_subsub_categories\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` ADD CONSTRAINT \`FK_778777c5d7d56ed1bbaa907b8e5\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` ADD CONSTRAINT \`FK_e5de51ca888d8b1f5ac25799dd1\` FOREIGN KEY (\`customerId\`) REFERENCES \`customers\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`orders\` DROP FOREIGN KEY \`FK_e5de51ca888d8b1f5ac25799dd1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` DROP FOREIGN KEY \`FK_778777c5d7d56ed1bbaa907b8e5\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` DROP FOREIGN KEY \`FK_a1eac2ff237dae6d166c340c71b\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` DROP FOREIGN KEY \`FK_359bd8406fbfb50e3ea42b5631f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` DROP FOREIGN KEY \`FK_cd3cd1906c2198f36dc5e7fe4d4\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` DROP FOREIGN KEY \`FK_2234441aac965d27bd93edb33d6\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_sessions\` DROP FOREIGN KEY \`FK_b92819d35788ce4f13232c8f17f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`business_logs\` DROP FOREIGN KEY \`FK_3b1f2fb3e2c5094da0d71cb5c6f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`businesses\` DROP FOREIGN KEY \`FK_02e7bfb8e766e8e0ef449cc0f36\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscriptions\` DROP FOREIGN KEY \`FK_7536cba909dd7584a4640cad7d5\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscriptions\` DROP FOREIGN KEY \`FK_7e9f8a764f844a37dc4a968494a\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`customers\` DROP FOREIGN KEY \`FK_652f05fd67ef9354cb047aae572\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_categories\` DROP FOREIGN KEY \`FK_408cd327d592771780bb6a759df\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_subcategories\` DROP FOREIGN KEY \`FK_a3ceae719e4fd83066e83d8371b\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_subsub_categories\` DROP FOREIGN KEY \`FK_ae6879221a152e5a349ad846344\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` CHANGE \`customerId\` \`customerId\` int NULL DEFAULT 'NULL'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` CHANGE \`businessId\` \`businessId\` int NULL DEFAULT 'NULL'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` CHANGE \`created_at\` \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP()`,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` ADD CONSTRAINT \`FK_e5de51ca888d8b1f5ac25799dd1\` FOREIGN KEY (\`customerId\`) REFERENCES \`customers\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` ADD CONSTRAINT \`FK_778777c5d7d56ed1bbaa907b8e5\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` CHANGE \`subsubCategoryId\` \`subsubCategoryId\` int NULL DEFAULT 'NULL'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` CHANGE \`businessId\` \`businessId\` int NULL DEFAULT 'NULL'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` CHANGE \`created_at\` \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP()`,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` CHANGE \`description\` \`description\` varchar(255) NULL DEFAULT 'NULL'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` ADD CONSTRAINT \`FK_a1eac2ff237dae6d166c340c71b\` FOREIGN KEY (\`subsubCategoryId\`) REFERENCES \`product_subsub_categories\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` ADD CONSTRAINT \`FK_359bd8406fbfb50e3ea42b5631f\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` CHANGE \`customerId\` \`customerId\` int NULL DEFAULT 'NULL'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` CHANGE \`businessId\` \`businessId\` int NULL DEFAULT 'NULL'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` CHANGE \`created_at\` \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP()`,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` ADD CONSTRAINT \`FK_cd3cd1906c2198f36dc5e7fe4d4\` FOREIGN KEY (\`customerId\`) REFERENCES \`customers\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` ADD CONSTRAINT \`FK_2234441aac965d27bd93edb33d6\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_sessions\` CHANGE \`businessId\` \`businessId\` int NULL DEFAULT 'NULL'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_sessions\` CHANGE \`created_at\` \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP()`,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_sessions\` ADD CONSTRAINT \`FK_b92819d35788ce4f13232c8f17f\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`business_logs\` CHANGE \`businessId\` \`businessId\` int NULL DEFAULT 'NULL'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`business_logs\` CHANGE \`created_at\` \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP()`,
    );
    await queryRunner.query(
      `ALTER TABLE \`business_logs\` CHANGE \`description\` \`description\` text NULL DEFAULT 'NULL'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`business_logs\` ADD CONSTRAINT \`FK_3b1f2fb3e2c5094da0d71cb5c6f\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` CHANGE \`updated_at\` \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP() ON UPDATE CURRENT_TIMESTAMP()`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` CHANGE \`created_at\` \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP()`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` CHANGE \`phone\` \`phone\` varchar(255) NULL DEFAULT 'NULL'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`businesses\` CHANGE \`ownerId\` \`ownerId\` int NULL DEFAULT 'NULL'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`businesses\` ADD CONSTRAINT \`FK_02e7bfb8e766e8e0ef449cc0f36\` FOREIGN KEY (\`ownerId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscriptions\` CHANGE \`planId\` \`planId\` int NULL DEFAULT 'NULL'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscriptions\` CHANGE \`businessId\` \`businessId\` int NULL DEFAULT 'NULL'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscriptions\` ADD CONSTRAINT \`FK_7536cba909dd7584a4640cad7d5\` FOREIGN KEY (\`planId\`) REFERENCES \`subscription_plans\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscriptions\` ADD CONSTRAINT \`FK_7e9f8a764f844a37dc4a968494a\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`customers\` CHANGE \`businessId\` \`businessId\` int NULL DEFAULT 'NULL'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`customers\` CHANGE \`created_at\` \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP()`,
    );
    await queryRunner.query(
      `ALTER TABLE \`customers\` CHANGE \`email\` \`email\` varchar(255) NULL DEFAULT 'NULL'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`customers\` ADD CONSTRAINT \`FK_652f05fd67ef9354cb047aae572\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_categories\` CHANGE \`businessId\` \`businessId\` int NULL DEFAULT 'NULL'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_categories\` ADD CONSTRAINT \`FK_408cd327d592771780bb6a759df\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_subcategories\` CHANGE \`categoryId\` \`categoryId\` int NULL DEFAULT 'NULL'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_subcategories\` ADD CONSTRAINT \`FK_a3ceae719e4fd83066e83d8371b\` FOREIGN KEY (\`categoryId\`) REFERENCES \`product_categories\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_subsub_categories\` CHANGE \`subcategoryId\` \`subcategoryId\` int NULL DEFAULT 'NULL'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_subsub_categories\` ADD CONSTRAINT \`FK_ae6879221a152e5a349ad846344\` FOREIGN KEY (\`subcategoryId\`) REFERENCES \`product_subcategories\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_ada3add8dce14c6f793988bdb1\` ON \`user_states\``,
    );
    await queryRunner.query(`DROP TABLE \`user_states\``);
  }
}
